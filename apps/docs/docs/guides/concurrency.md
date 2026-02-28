---
sidebar_position: 5
---

# Concurrency

## Worker Concurrency

The `concurrency` option controls how many jobs a single worker processes simultaneously:

```typescript
const worker = new Worker({
  client,
  handlers: { /* ... */ },
  concurrency: 5,  // Process up to 5 jobs at once (default: 1)
});
```

### How Polling Interacts with Concurrency

The worker polls on a fixed interval (default: 1000ms). On each poll:

1. Check if `activeJobs < concurrency`
2. If yes, attempt to claim a job
3. If a job is claimed, start processing it (async, non-blocking)
4. On the next poll, check again

This means the worker fills its concurrency slots over multiple poll cycles, not all at once. With `concurrency: 5` and `pollIntervalMs: 1000`, it takes up to 5 seconds to reach full concurrency from empty.

## Heartbeat Tuning

Each active job sends heartbeats independently. With high concurrency, this increases the number of heartbeat requests:

- 5 concurrent jobs × 1 heartbeat/5s = 1 heartbeat/second
- 20 concurrent jobs × 1 heartbeat/5s = 4 heartbeats/second

For long-running jobs, increase the heartbeat interval to reduce load:

```typescript
const worker = new Worker({
  client,
  handlers: { /* ... */ },
  concurrency: 10,
  heartbeatIntervalMs: 15000,  // 15s instead of default 5s
});
```

Make sure the broker's `heartbeatTimeoutMs` (default: 30s) is at least 2-3x the worker's `heartbeatIntervalMs` to avoid false expiry.

## Scaling: Processes vs Concurrency

Two ways to increase throughput:

### Higher concurrency per worker

```typescript
// Single worker, 10 concurrent jobs
const worker = new Worker({ client, handlers, concurrency: 10 });
```

- Simpler deployment
- Shares a single event loop
- Good for I/O-bound jobs

### Multiple worker processes

```bash
# 3 separate worker processes, each with concurrency 1
for i in 1 2 3; do
  bun run worker.ts &
done
```

- Better CPU utilization for compute-heavy jobs
- Independent failure domains
- Each process has its own connection to the broker

The production entrypoint runs 3 worker processes. You can combine both approaches.

## Group Commit Interval Tuning

The broker's `GROUP_COMMIT_INTERVAL_MS` affects how quickly mutations are committed:

| Interval | Mutations/write | Latency | S3 writes/min |
|----------|----------------|---------|---------------|
| 50ms | 1-2 | ~50ms | ~1200 |
| 500ms | 5-20 | ~500ms | ~120 |
| 2000ms | 20-100 | ~2s | ~30 |

For development, the default 50ms provides near-instant feedback. For production, 2000ms reduces costs while still processing jobs within seconds.

```bash
# Development (default)
GROUP_COMMIT_INTERVAL_MS=50

# Production
GROUP_COMMIT_INTERVAL_MS=2000
```
