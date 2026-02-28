import type {
  StorageBackend,
  StorageVersion,
  StorageReadResult,
} from "@osqueue/types";

export interface ThrottleStats {
  totalReads: number;
  totalWrites: number;
  throttledReads: number;
  throttledWrites: number;
  totalReadDelayMs: number;
  totalWriteDelayMs: number;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly refillRate: number; // tokens per ms
  private readonly burst: number;

  constructor(maxPerMinute: number) {
    this.refillRate = maxPerMinute / 60_000;
    this.burst = Math.max(1, Math.floor(maxPerMinute / 60));
    this.tokens = this.burst;
    this.lastRefill = Date.now();
  }

  /** Returns the delay in ms needed before a token is available. */
  acquire(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    // Calculate how long until 1 token is available
    const deficit = 1 - this.tokens;
    const delayMs = deficit / this.refillRate;
    this.tokens = 0; // will be refilled when next checked
    return Math.ceil(delayMs);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.burst, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;
    }
  }
}

export interface ThrottledStorageBackendOptions {
  backend: StorageBackend;
  maxReadsPerMinute?: number;
  maxWritesPerMinute?: number;
}

export class ThrottledStorageBackend implements StorageBackend {
  private backend: StorageBackend;
  private readBucket: TokenBucket | null;
  private writeBucket: TokenBucket | null;
  private stats: ThrottleStats = {
    totalReads: 0,
    totalWrites: 0,
    throttledReads: 0,
    throttledWrites: 0,
    totalReadDelayMs: 0,
    totalWriteDelayMs: 0,
  };

  constructor(opts: ThrottledStorageBackendOptions) {
    this.backend = opts.backend;
    this.readBucket =
      opts.maxReadsPerMinute && opts.maxReadsPerMinute > 0
        ? new TokenBucket(opts.maxReadsPerMinute)
        : null;
    this.writeBucket =
      opts.maxWritesPerMinute && opts.maxWritesPerMinute > 0
        ? new TokenBucket(opts.maxWritesPerMinute)
        : null;
  }

  private async acquireRead(): Promise<void> {
    this.stats.totalReads++;
    if (!this.readBucket) return;
    const delay = this.readBucket.acquire();
    if (delay > 0) {
      this.stats.throttledReads++;
      this.stats.totalReadDelayMs += delay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  private async acquireWrite(): Promise<void> {
    this.stats.totalWrites++;
    if (!this.writeBucket) return;
    const delay = this.writeBucket.acquire();
    if (delay > 0) {
      this.stats.throttledWrites++;
      this.stats.totalWriteDelayMs += delay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async read(key: string): Promise<StorageReadResult | null> {
    await this.acquireRead();
    return this.backend.read(key);
  }

  async write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion> {
    await this.acquireWrite();
    return this.backend.write(key, data, expectedVersion);
  }

  async createIfNotExists(
    key: string,
    data: Uint8Array,
  ): Promise<StorageVersion> {
    await this.acquireWrite();
    return this.backend.createIfNotExists(key, data);
  }

  getStats(): ThrottleStats {
    return { ...this.stats };
  }
}
