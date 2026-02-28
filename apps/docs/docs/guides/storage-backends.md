---
sidebar_position: 3
---

# Storage Backends

osqueue supports three storage backends. All implement the `StorageBackend` interface with CAS (compare-and-swap) semantics.

## Memory

In-memory storage for development and testing. No persistence — data is lost when the process exits.

```typescript
import { MemoryBackend } from "@osqueue/storage";

const storage = new MemoryBackend();

// Optional: add artificial latency for realistic testing
const storage = new MemoryBackend({ latencyMs: 50 });
```

**CAS implementation**: Uses an internal version counter that increments on each write.

**When to use**: Local development, unit tests, quick demos.

## S3

Production backend using Amazon S3. Uses ETags for CAS operations.

```typescript
import { S3Backend } from "@osqueue/storage";

const storage = new S3Backend({
  bucket: "my-queue-bucket",
  prefix: "osqueue/",                // optional key prefix
  clientConfig: { region: "us-east-1" },  // AWS SDK config
});
```

**CAS implementation**:

- `read()`: Returns the object's ETag as the version token
- `write()`: Uses `IfMatch` header to ensure the ETag hasn't changed
- `createIfNotExists()`: Uses `IfNoneMatch: "*"` to prevent overwriting

**Configuration via environment**:

```bash
STORAGE_BACKEND=s3
S3_BUCKET=my-queue-bucket
S3_REGION=us-east-1
S3_PREFIX=osqueue/          # optional
```

**When to use**: Production AWS deployments.

## GCS

Production backend using Google Cloud Storage. Uses generation numbers for CAS operations.

```typescript
import { GCSBackend } from "@osqueue/storage";

const storage = new GCSBackend({
  bucket: "my-queue-bucket",
  prefix: "osqueue/",     // optional key prefix
});
```

**CAS implementation**:

- `read()`: Returns the object's generation number as the version token
- `write()`: Uses `ifGenerationMatch` precondition
- `createIfNotExists()`: Uses `ifGenerationMatch: 0` (only succeeds if object doesn't exist)

**Configuration via environment**:

```bash
STORAGE_BACKEND=gcs
GCS_BUCKET=my-queue-bucket
GCS_PREFIX=osqueue/         # optional
```

**When to use**: Production GCP deployments.

## Decision Matrix

| Criteria | Memory | S3 | GCS |
|----------|--------|-----|-----|
| Persistence | None | Durable | Durable |
| Setup required | None | AWS account + bucket | GCP project + bucket |
| Cost | Free | ~$0.005/1000 requests | ~$0.005/1000 requests |
| Latency | Under 1ms | 10-100ms | 10-100ms |
| Use case | Dev/test | Production (AWS) | Production (GCP) |

## CAS Guarantees

All backends provide the same consistency guarantees:

1. **Read-your-writes**: After a successful write, the next read returns the new data
2. **Atomic CAS**: A write succeeds only if the version matches, preventing lost updates
3. **Conflict detection**: `CASConflictError` is thrown when a concurrent write is detected

The `GroupCommitEngine` handles CAS conflicts automatically with retry and backoff. You don't need to handle conflicts in application code.

## Wrapping with Throttling

Any backend can be wrapped with `ThrottledStorageBackend` for rate limiting. See [Throttling](/guides/throttling).
