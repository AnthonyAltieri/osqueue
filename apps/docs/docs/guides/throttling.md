---
sidebar_position: 4
---

# Throttling

osqueue includes a token-bucket rate limiter to control storage API costs. At high throughput, the group-commit engine can issue many S3/GCS API calls. Throttling caps the rate to keep costs predictable.

## The Problem

S3 pricing example:
- PUT/POST: $0.005 per 1,000 requests
- GET: $0.0004 per 1,000 requests

With a 50ms commit interval and no throttling, the broker could issue:
- 1,200 writes/minute × $0.005/1000 = $0.006/minute = **$8.64/month**
- Plus reads for CAS conflicts

With throttling at 30 writes/minute:
- 30 writes/minute × $0.005/1000 = **$0.22/month**

## Configuration

Wrap any storage backend with `ThrottledStorageBackend`:

```typescript
import { S3Backend, ThrottledStorageBackend } from "@osqueue/storage";

const s3 = new S3Backend({ bucket: "my-bucket" });

const storage = new ThrottledStorageBackend({
  backend: s3,
  maxReadsPerMinute: 60,
  maxWritesPerMinute: 30,
});
```

Or via environment variables (used by the example app):

```bash
S3_MAX_READS_PER_MINUTE=60
S3_MAX_WRITES_PER_MINUTE=30
```

## How It Works

The `ThrottledStorageBackend` uses a **token bucket** algorithm:

1. Each bucket starts with a burst of tokens (1/60th of the per-minute rate)
2. Tokens refill continuously at the configured rate
3. Each read or write consumes one token
4. If no tokens are available, the operation is delayed until a token refills

This smooths out bursts while maintaining the target average rate. Operations are never rejected — only delayed.

## Monitoring

The broker exposes throttle statistics at `GET /v1/throttle-stats`:

```json
{
  "totalReads": 1523,
  "totalWrites": 847,
  "throttledReads": 12,
  "throttledWrites": 203,
  "totalReadDelayMs": 1200,
  "totalWriteDelayMs": 45600
}
```

| Field | Description |
|-------|-------------|
| `totalReads` | Total read operations since startup |
| `totalWrites` | Total write operations since startup |
| `throttledReads` | Reads that were delayed by the rate limiter |
| `throttledWrites` | Writes that were delayed by the rate limiter |
| `totalReadDelayMs` | Cumulative delay added to reads |
| `totalWriteDelayMs` | Cumulative delay added to writes |

If `throttledWrites` is high relative to `totalWrites`, your commit interval may be too low. Increase `GROUP_COMMIT_INTERVAL_MS` to batch more mutations per write.

## Production Defaults

The production entrypoint uses these settings:

```bash
S3_MAX_WRITES_PER_MINUTE=30    # ~$0.22/month for writes
S3_MAX_READS_PER_MINUTE=60     # ~$0.04/month for reads
GROUP_COMMIT_INTERVAL_MS=2000  # Batch mutations over 2s windows
```

Combined cost: approximately **$0.25/month** for S3 API calls.
