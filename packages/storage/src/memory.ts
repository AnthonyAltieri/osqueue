import type {
  StorageBackend,
  StorageVersion,
  StorageReadResult,
} from "@osqueue/types";
import {
  CASConflictError,
  StorageBackendError,
  wrapUnknownError,
} from "@osqueue/types";

export interface MemoryBackendOptions {
  /** Artificial latency in ms added to each operation */
  latencyMs?: number;
  /** If set, operations will fail with this error (for testing) */
  failWith?: Error | null;
}

interface StoredObject {
  data: Uint8Array;
  version: number;
}

export class MemoryBackend implements StorageBackend {
  private objects = new Map<string, StoredObject>();
  private options: MemoryBackendOptions;

  constructor(options: MemoryBackendOptions = {}) {
    this.options = options;
  }

  /** Update options at runtime (useful for injecting failures mid-test) */
  setOptions(options: Partial<MemoryBackendOptions>): void {
    Object.assign(this.options, options);
  }

  private async maybeDelay(): Promise<void> {
    if (this.options.failWith) {
      throw wrapUnknownError(
        this.options.failWith,
        (message, cause) =>
          new StorageBackendError(`Memory backend failure: ${message}`, {
            cause,
          }),
      );
    }
    if (this.options.latencyMs && this.options.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.options.latencyMs));
    }
  }

  private versionToken(v: number): StorageVersion {
    return { token: String(v) };
  }

  async read(key: string): Promise<StorageReadResult | null> {
    await this.maybeDelay();
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      data: new Uint8Array(obj.data),
      version: this.versionToken(obj.version),
    };
  }

  async write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion> {
    await this.maybeDelay();
    const obj = this.objects.get(key);
    if (!obj) {
      throw new CASConflictError("Object not found for CAS write");
    }
    if (String(obj.version) !== expectedVersion.token) {
      throw new CASConflictError(
        `Expected version ${expectedVersion.token}, got ${obj.version}`,
      );
    }
    const newVersion = obj.version + 1;
    this.objects.set(key, { data: new Uint8Array(data), version: newVersion });
    return this.versionToken(newVersion);
  }

  async createIfNotExists(
    key: string,
    data: Uint8Array,
  ): Promise<StorageVersion> {
    await this.maybeDelay();
    if (this.objects.has(key)) {
      throw new CASConflictError("Object already exists");
    }
    const version = 1;
    this.objects.set(key, { data: new Uint8Array(data), version });
    return this.versionToken(version);
  }
}
