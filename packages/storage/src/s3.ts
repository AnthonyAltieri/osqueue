import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
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
import {
  createTracer,
  withSpan,
  OSQUEUE_STORAGE_KEY,
  OSQUEUE_STORAGE_BACKEND,
  OSQUEUE_STORAGE_OPERATION,
} from "@osqueue/otel";

const tracer = createTracer("@osqueue/storage");

export interface S3BackendOptions {
  bucket: string;
  prefix?: string;
  clientConfig?: S3ClientConfig;
}

export class S3Backend implements StorageBackend {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(options: S3BackendOptions) {
    this.client = new S3Client(options.clientConfig ?? {});
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? "";
  }

  private fullKey(key: string): string {
    return this.prefix + key;
  }

  async read(key: string): Promise<StorageReadResult | null> {
    return withSpan(tracer, "storage.read", {
      [OSQUEUE_STORAGE_KEY]: key,
      [OSQUEUE_STORAGE_BACKEND]: "s3",
      [OSQUEUE_STORAGE_OPERATION]: "read",
    }, async () => {
      try {
        const response = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: this.fullKey(key),
          }),
        );
        const body = await response.Body!.transformToByteArray();
        return {
          data: body,
          version: { token: response.ETag! },
        };
      } catch (err: any) {
        if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw wrapUnknownError(
          err,
          (message, cause) =>
            new StorageBackendError(`S3 read failed: ${message}`, { cause }),
        );
      }
    });
  }

  async write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion> {
    return withSpan(tracer, "storage.write", {
      [OSQUEUE_STORAGE_KEY]: key,
      [OSQUEUE_STORAGE_BACKEND]: "s3",
      [OSQUEUE_STORAGE_OPERATION]: "write",
    }, async () => {
      try {
        const response = await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.fullKey(key),
            Body: data,
            ContentType: "application/json",
            IfMatch: expectedVersion.token,
          }),
        );
        return { token: response.ETag! };
      } catch (err: any) {
        if (
          err.name === "PreconditionFailed" ||
          err.$metadata?.httpStatusCode === 412
        ) {
          throw new CASConflictError("S3 ETag mismatch");
        }
        throw wrapUnknownError(
          err,
          (message, cause) =>
            new StorageBackendError(`S3 write failed: ${message}`, { cause }),
        );
      }
    });
  }

  async createIfNotExists(
    key: string,
    data: Uint8Array,
  ): Promise<StorageVersion> {
    return withSpan(tracer, "storage.createIfNotExists", {
      [OSQUEUE_STORAGE_KEY]: key,
      [OSQUEUE_STORAGE_BACKEND]: "s3",
      [OSQUEUE_STORAGE_OPERATION]: "createIfNotExists",
    }, async () => {
      try {
        const response = await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.fullKey(key),
            Body: data,
            ContentType: "application/json",
            IfNoneMatch: "*",
          }),
        );
        return { token: response.ETag! };
      } catch (err: any) {
        if (
          err.name === "PreconditionFailed" ||
          err.$metadata?.httpStatusCode === 412
        ) {
          throw new CASConflictError("S3 object already exists");
        }
        throw wrapUnknownError(
          err,
          (message, cause) =>
            new StorageBackendError(`S3 create failed: ${message}`, { cause }),
        );
      }
    });
  }
}
