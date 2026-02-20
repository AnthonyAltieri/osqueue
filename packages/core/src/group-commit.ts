import type {
  StorageBackend,
  StorageVersion,
  QueueState,
  Mutation,
  MutationResult,
} from "@osqueue/types";
import {
  CASConflictError,
  QUEUE_STATE_KEY,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
} from "@osqueue/types";
import { applyMutation, emptyState, expireHeartbeats } from "./state.js";

interface PendingMutation {
  mutation: Mutation;
  resolve: (result: MutationResult) => void;
  reject: (error: Error) => void;
}

export interface GroupCommitEngineOptions {
  storage: StorageBackend;
  /** Key for the queue state object (default: "queue.json") */
  stateKey?: string;
  /** How often the write loop runs in ms (default: 50) */
  intervalMs?: number;
  /** Heartbeat expiry timeout in ms (default: 30000) */
  heartbeatTimeoutMs?: number;
  /** Backoff after CAS conflict in ms (default: 50) */
  conflictBackoffMs?: number;
  /** Max CAS retries per loop iteration (default: 5) */
  maxRetries?: number;
}

export class GroupCommitEngine {
  private storage: StorageBackend;
  private stateKey: string;
  private intervalMs: number;
  private heartbeatTimeoutMs: number;
  private conflictBackoffMs: number;
  private maxRetries: number;

  private buffer: PendingMutation[] = [];
  private cachedState: QueueState | null = null;
  private cachedVersion: StorageVersion | null = null;
  private running = false;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GroupCommitEngineOptions) {
    this.storage = options.storage;
    this.stateKey = options.stateKey ?? QUEUE_STATE_KEY;
    this.intervalMs = options.intervalMs ?? 50;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.conflictBackoffMs = options.conflictBackoffMs ?? 50;
    this.maxRetries = options.maxRetries ?? 5;
  }

  /** Submit a mutation. Returns a Promise that resolves when the mutation is committed. */
  submit(mutation: Mutation): Promise<MutationResult> {
    return new Promise((resolve, reject) => {
      this.buffer.push({ mutation, resolve, reject });
      // If the loop is idle, kick it immediately
      if (this.running && this.buffer.length === 1) {
        this.scheduleLoop(0);
      }
    });
  }

  /** Start the write loop */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.ensureStateExists();
    this.scheduleLoop(0);
  }

  /** Stop the write loop. Rejects any pending mutations. */
  stop(): void {
    this.running = false;
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    // Reject remaining buffered mutations
    const remaining = this.buffer.splice(0);
    for (const pm of remaining) {
      pm.reject(new Error("GroupCommitEngine stopped"));
    }
  }

  /** Get a snapshot of the current cached state (may be slightly stale) */
  getCachedState(): QueueState | null {
    return this.cachedState;
  }

  private async ensureStateExists(): Promise<void> {
    const encoder = new TextEncoder();
    try {
      const version = await this.storage.createIfNotExists(
        this.stateKey,
        encoder.encode(JSON.stringify(emptyState())),
      );
      this.cachedState = emptyState();
      this.cachedVersion = version;
    } catch (err) {
      if (err instanceof CASConflictError) {
        // Already exists — read it
        await this.refreshCache();
      } else {
        throw err;
      }
    }
  }

  private async refreshCache(): Promise<void> {
    const result = await this.storage.read(this.stateKey);
    if (result) {
      const decoder = new TextDecoder();
      this.cachedState = JSON.parse(decoder.decode(result.data)) as QueueState;
      this.cachedVersion = result.version;
    }
  }

  private scheduleLoop(delayMs: number): void {
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
    }
    this.loopTimer = setTimeout(() => this.writeLoop(), delayMs);
  }

  private async writeLoop(): Promise<void> {
    if (!this.running) return;

    try {
      await this.processBuffer();
    } catch (err) {
      // Unexpected error — reject entire batch
      const batch = this.buffer.splice(0);
      for (const pm of batch) {
        pm.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (this.running && this.buffer.length > 0) {
      this.scheduleLoop(0);
    } else if (this.running) {
      this.scheduleLoop(this.intervalMs);
    }
  }

  private async processBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Drain current buffer
    const batch = this.buffer.splice(0);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Ensure we have state
      if (!this.cachedState || !this.cachedVersion) {
        await this.refreshCache();
      }
      if (!this.cachedState || !this.cachedVersion) {
        throw new Error("Failed to read queue state");
      }

      // Apply all mutations to a copy of the state
      const now = Date.now();
      let state = this.cachedState;
      const results: MutationResult[] = [];

      // Run heartbeat expiry on every write pass
      state = expireHeartbeats(state, now, this.heartbeatTimeoutMs);

      for (const pm of batch) {
        const { state: newState, result } = applyMutation(
          state,
          pm.mutation,
          now,
        );
        state = newState;
        results.push(result);
      }

      // CAS write
      const encoder = new TextEncoder();
      try {
        const newVersion = await this.storage.write(
          this.stateKey,
          encoder.encode(JSON.stringify(state)),
          this.cachedVersion,
        );

        // Success — update cache and resolve all promises
        this.cachedState = state;
        this.cachedVersion = newVersion;

        for (let i = 0; i < batch.length; i++) {
          batch[i]!.resolve(results[i]!);
        }
        return;
      } catch (err) {
        if (err instanceof CASConflictError) {
          // Invalidate cache and retry
          this.cachedState = null;
          this.cachedVersion = null;

          if (attempt < this.maxRetries) {
            await new Promise((r) =>
              setTimeout(r, this.conflictBackoffMs * (attempt + 1)),
            );
            continue;
          }
        }
        // Non-CAS error or max retries exceeded — reject batch
        for (const pm of batch) {
          pm.reject(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }
    }
  }
}
