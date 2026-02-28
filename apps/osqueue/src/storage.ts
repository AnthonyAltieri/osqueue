import { createRequire } from "node:module";
import { ConfigError, type StorageBackend } from "@osqueue/types";
import { GCSBackend, MemoryBackend, S3Backend, ThrottledStorageBackend } from "@osqueue/storage";
import { env } from "./env.js";

const require = createRequire(import.meta.url);

function getSstBucketName(): string | undefined {
  try {
    const { Resource } = require("sst") as {
      Resource?: { QueueBucket?: { name?: string } };
    };
    return Resource?.QueueBucket?.name;
  } catch {
    return undefined;
  }
}

export function createStorage(): StorageBackend {
  const sstBucket = getSstBucketName();
  const backendType = sstBucket ? "s3" : env.STORAGE_BACKEND;

  let backend: StorageBackend;
  switch (backendType) {
    case "memory":
      backend = new MemoryBackend();
      break;
    case "s3": {
      const bucketName = env.S3_BUCKET ?? sstBucket;
      if (!bucketName) {
        throw new ConfigError("S3_BUCKET is required when STORAGE_BACKEND=s3");
      }
      backend = new S3Backend({
        bucket: bucketName,
        prefix: env.S3_PREFIX,
        clientConfig: { region: env.S3_REGION },
      });
      break;
    }
    case "gcs":
      if (!env.GCS_BUCKET) {
        throw new ConfigError("GCS_BUCKET is required when STORAGE_BACKEND=gcs");
      }
      backend = new GCSBackend({
        bucket: env.GCS_BUCKET,
        prefix: env.GCS_PREFIX,
      });
      break;
  }

  if (env.S3_MAX_READS_PER_MINUTE > 0 || env.S3_MAX_WRITES_PER_MINUTE > 0 || env.S3_MAX_WRITES_PER_DAY > 0) {
    return new ThrottledStorageBackend({
      backend,
      maxReadsPerMinute: env.S3_MAX_READS_PER_MINUTE,
      maxWritesPerMinute: env.S3_MAX_WRITES_PER_MINUTE,
      maxWritesPerDay: env.S3_MAX_WRITES_PER_DAY,
    });
  }

  return backend;
}
