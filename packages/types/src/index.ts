// ── Branded type utilities ──

declare const brand: unique symbol;
export type Brand<T, B> = T & { [brand]: B };

export type JobId = Brand<string, "JobId">;
export type WorkerId = Brand<string, "WorkerId">;

// ── Storage types ──

/** Opaque version token wrapping S3 ETags or GCS generation numbers */
export interface StorageVersion {
  readonly token: string;
}

export interface StorageReadResult {
  data: Uint8Array;
  version: StorageVersion;
}

/** Minimal object-storage interface with CAS semantics */
export interface StorageBackend {
  /** Read an object. Returns null if not found. */
  read(key: string): Promise<StorageReadResult | null>;

  /**
   * Write an object with compare-and-set.
   * Throws CASConflictError if the current version doesn't match expectedVersion.
   */
  write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion>;

  /**
   * Create an object only if it doesn't already exist.
   * Returns the new version on success.
   * Throws CASConflictError if the object already exists.
   */
  createIfNotExists(key: string, data: Uint8Array): Promise<StorageVersion>;
}

// ── Error classes ──

export class CASConflictError extends Error {
  constructor(message = "CAS conflict: version mismatch") {
    super(message);
    this.name = "CASConflictError";
  }
}

// ── Queue state types ──

export type JobStatus = "unclaimed" | "in_progress";

export interface Job {
  id: JobId;
  status: JobStatus;
  payload: unknown;
  type?: string;
  heartbeat?: number;
  workerId?: WorkerId;
  createdAt: number;
  attempts: number;
  maxAttempts?: number;
}

export interface QueueState {
  /** Broker host:port or null if no broker registered */
  broker: string | null;
  /** Broker liveness timestamp (ms since epoch) */
  brokerHeartbeat: number;
  /** Ordered job array, FIFO */
  jobs: Job[];
  /** Running count of completed jobs */
  completedTotal: number;
}

// ── Mutation types ──

export type Mutation =
  | { type: "enqueue"; jobs: Array<{ payload: unknown; jobType?: string; maxAttempts?: number }> }
  | { type: "claim"; workerId: WorkerId; jobTypes?: string[] }
  | { type: "heartbeat"; jobId: JobId; workerId: WorkerId }
  | { type: "complete"; jobId: JobId; workerId: WorkerId }
  | {
      type: "register_broker";
      brokerAddress: string;
      timestamp: number;
    };

export interface MutationResult {
  /** For claim mutations, the claimed job (if any) */
  claimedJob?: { id: JobId; payload: unknown; type?: string } | null;
  /** For enqueue mutations, the IDs of enqueued jobs */
  enqueuedIds?: JobId[];
}

// ── Constants ──

export const QUEUE_STATE_KEY = "queue.json";

export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;
export const DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
