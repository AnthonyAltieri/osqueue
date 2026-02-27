import { MemoryBackend, S3Backend, GCSBackend } from "@osqueue/storage";
import { env } from "./env.js";

function getSstBucketName() {
    try {
        const { Resource } = require("sst");
        return Resource.QueueBucket?.name;
    } catch {
        return undefined;
    }
}

export function createStorage() {
    // Auto-detect SST bucket — use S3 if available, even without STORAGE_BACKEND=s3
    const sstBucket = getSstBucketName();
    const backend = sstBucket ? "s3" : env.STORAGE_BACKEND;

    switch (backend) {
        case "memory":
            return new MemoryBackend();
        case "s3": {
            const bucketName = env.S3_BUCKET ?? sstBucket;
            if (!bucketName) {
                throw new Error("S3_BUCKET is required when STORAGE_BACKEND=s3");
            }
            return new S3Backend({
                bucket: bucketName,
                prefix: env.S3_PREFIX,
                clientConfig: { region: env.S3_REGION },
            });
        }
        case "gcs":
            if (!env.GCS_BUCKET) {
                throw new Error("GCS_BUCKET is required when STORAGE_BACKEND=gcs");
            }
            return new GCSBackend({
                bucket: env.GCS_BUCKET,
                prefix: env.GCS_PREFIX,
            });
    }
}
