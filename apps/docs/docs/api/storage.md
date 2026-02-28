---
sidebar_position: 4
---

# Storage

The storage layer provides a minimal object-storage interface with CAS (compare-and-swap) semantics.

## StorageBackend Interface

```typescript
interface StorageBackend {
  read(key: string): Promise<StorageReadResult | null>;

  write(
    key: string,
    data: Uint8Array,
    expectedVersion: StorageVersion,
  ): Promise<StorageVersion>;

  createIfNotExists(key: string, data: Uint8Array): Promise<StorageVersion>;
}
```

### `read(key)`

Read an object from storage.

- Returns `{ data: Uint8Array, version: StorageVersion }` if the object exists
- Returns `null` if the object doesn't exist

### `write(key, data, expectedVersion)`

Write an object with compare-and-set semantics.

- Returns the new `StorageVersion` on success
- Throws `CASConflictError` if the current version doesn't match `expectedVersion`

### `createIfNotExists(key, data)`

Create an object only if it doesn't already exist.

- Returns the new `StorageVersion` on success
- Throws `CASConflictError` if the object already exists

## Types

### `StorageVersion`

```typescript
interface StorageVersion {
  readonly token: string;
}
```

Opaque version token. For S3, this wraps an ETag. For GCS, a generation number. For memory, an incrementing counter.

### `StorageReadResult`

```typescript
interface StorageReadResult {
  data: Uint8Array;
  version: StorageVersion;
}
```

## Backend Constructors

### MemoryBackend

```typescript
import { MemoryBackend } from "@osqueue/storage";

const storage = new MemoryBackend();
const storage = new MemoryBackend({ latencyMs: 50 });
```

| Option | Default | Description |
|--------|---------|-------------|
| `latencyMs` | `0` | Artificial delay per operation (for testing) |
| `failWith` | — | Error to throw (for fault injection testing) |

### S3Backend

```typescript
import { S3Backend } from "@osqueue/storage";

const storage = new S3Backend({
  bucket: "my-bucket",
  prefix: "osqueue/",
  clientConfig: { region: "us-east-1" },
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `bucket` | — (required) | S3 bucket name |
| `prefix` | `""` | Key prefix for all objects |
| `clientConfig` | `{}` | AWS SDK S3Client configuration |

### GCSBackend

```typescript
import { GCSBackend } from "@osqueue/storage";

const storage = new GCSBackend({
  bucket: "my-bucket",
  prefix: "osqueue/",
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `bucket` | — (required) | GCS bucket name |
| `prefix` | `""` | Key prefix for all objects |

### ThrottledStorageBackend

Wraps any `StorageBackend` with token-bucket rate limiting.

```typescript
import { ThrottledStorageBackend } from "@osqueue/storage";

const storage = new ThrottledStorageBackend({
  backend: s3Backend,
  maxReadsPerMinute: 60,
  maxWritesPerMinute: 30,
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `backend` | — (required) | The underlying storage backend |
| `maxReadsPerMinute` | `0` (disabled) | Maximum read operations per minute |
| `maxWritesPerMinute` | `0` (disabled) | Maximum write operations per minute |

### `getStats()`

Returns throttle statistics:

```typescript
interface ThrottleStats {
  totalReads: number;
  totalWrites: number;
  throttledReads: number;
  throttledWrites: number;
  totalReadDelayMs: number;
  totalWriteDelayMs: number;
}

const stats = storage.getStats();
```
