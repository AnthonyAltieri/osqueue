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

export interface GCSBackendOptions {
  bucket: string;
  prefix?: string;
}

export class GCSBackend implements StorageBackend {
  private bucket: any; // @google-cloud/storage Bucket instance
  private prefix: string;

  constructor(options: GCSBackendOptions) {
    try {
      // Dynamic import to keep @google-cloud/storage optional
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      this.bucket = storage.bucket(options.bucket);
    } catch (error) {
      throw wrapUnknownError(
        error,
        (message, cause) =>
          new StorageBackendError(`Failed to initialize GCS backend: ${message}`, {
            cause,
          }),
      );
    }
    this.prefix = options.prefix ?? "";
  }

  private fullKey(key: string): string {
    return this.prefix + key;
  }

  async read(key: string): Promise<StorageReadResult | null> {
    const file = this.bucket.file(this.fullKey(key));
    try {
      const [contents] = await file.download();
      const [metadata] = await file.getMetadata();
      return {
        data: new Uint8Array(contents),
        version: { token: String(metadata.generation) },
      };
    } catch (err: any) {
      if (err.code === 404) return null;
      throw wrapUnknownError(
        err,
        (message, cause) =>
          new StorageBackendError(`GCS read failed: ${message}`, { cause }),
      );
    }
  }

  async write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion> {
    const file = this.bucket.file(this.fullKey(key));
    try {
      await file.save(Buffer.from(data), {
        resumable: false,
        preconditionOpts: {
          ifGenerationMatch: parseInt(expectedVersion.token, 10),
        },
        contentType: "application/json",
      });
      const [metadata] = await file.getMetadata();
      return { token: String(metadata.generation) };
    } catch (err: any) {
      if (err.code === 412) {
        throw new CASConflictError("GCS generation mismatch");
      }
      throw wrapUnknownError(
        err,
        (message, cause) =>
          new StorageBackendError(`GCS write failed: ${message}`, { cause }),
      );
    }
  }

  async createIfNotExists(
    key: string,
    data: Uint8Array,
  ): Promise<StorageVersion> {
    const file = this.bucket.file(this.fullKey(key));
    try {
      await file.save(Buffer.from(data), {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        contentType: "application/json",
      });
      const [metadata] = await file.getMetadata();
      return { token: String(metadata.generation) };
    } catch (err: any) {
      if (err.code === 412) {
        throw new CASConflictError("GCS object already exists");
      }
      throw wrapUnknownError(
        err,
        (message, cause) =>
          new StorageBackendError(`GCS create failed: ${message}`, { cause }),
      );
    }
  }
}
