import { createRequire } from "node:module";
import { ConfigError, type StorageBackend } from "@osqueue/types";
import { GCSBackend, MemoryBackend, S3Backend } from "@osqueue/storage";
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
  const backend = sstBucket ? "s3" : env.STORAGE_BACKEND;

  switch (backend) {
    case "memory":
      return new MemoryBackend();
    case "s3": {
      const bucketName = env.S3_BUCKET ?? sstBucket;
      if (!bucketName) {
        throw new ConfigError("S3_BUCKET is required when STORAGE_BACKEND=s3");
      }
      return new S3Backend({
        bucket: bucketName,
        prefix: env.S3_PREFIX,
        clientConfig: { region: env.S3_REGION },
      });
    }
    case "gcs":
      if (!env.GCS_BUCKET) {
        throw new ConfigError("GCS_BUCKET is required when STORAGE_BACKEND=gcs");
      }
      return new GCSBackend({
        bucket: env.GCS_BUCKET,
        prefix: env.GCS_PREFIX,
      });
  }
}
