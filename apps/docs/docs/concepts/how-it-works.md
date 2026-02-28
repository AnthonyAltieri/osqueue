---
sidebar_position: 2
---

# How It Works

## Compare-and-Swap (CAS)

osqueue uses CAS semantics for all writes to the queue state file. Every object storage backend provides a version token:

- **S3**: ETags (MD5 hash of the object)
- **GCS**: Generation numbers (monotonically increasing integers)
- **Memory**: Incremental version counter

The write flow:

1. Read `queue.json` → get data + version token
2. Apply mutations to the state in memory
3. Write the modified state back, passing the expected version
4. If the version matches, the write succeeds and returns a new version
5. If another writer changed the file, the write fails with `CASConflictError`
6. On conflict, re-read the file and retry

This is optimistic concurrency: writes succeed without locking as long as there's no contention. When there is contention, the retry loop ensures eventual consistency.

## Group Commit Engine

The `GroupCommitEngine` is the core of the broker. It batches multiple mutations into a single CAS write to reduce storage API calls.

```
Time ──────────────────────────────────────────────────▶

  submitJob("email:send")  ──┐
  claimJob(worker1)         ──┼── Batch ──▶ CAS Write ──▶ Resolve all
  heartbeat(job1, worker2)  ──┘
                                           50ms interval
  completeJob(job2, worker1) ──┐
  submitJob("report")        ──┼── Batch ──▶ CAS Write ──▶ Resolve all
                               ┘
```

### How Batching Works

1. Callers submit mutations via `engine.submit(mutation)` which returns a Promise
2. Mutations accumulate in a buffer
3. When a mutation arrives to an empty buffer, the write loop runs immediately (zero delay). When the buffer is empty, it polls every `intervalMs` (default: 50ms)
4. All buffered mutations are applied sequentially to the cached state (state transitions are immutable — each returns a new object)
5. Heartbeat expiry runs on every write pass (cleaning up stale jobs)
6. The modified state is written via CAS
7. On success, all Promises in the batch resolve
8. On CAS conflict, the engine re-reads state and retries (up to 5 times with backoff)

### Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `intervalMs` | `50` | Write loop interval in milliseconds |
| `heartbeatTimeoutMs` | `30000` | Time before an in-progress job is considered stale |
| `conflictBackoffMs` | `50` | Base backoff after CAS conflict (multiplied by `attempt + 1`, so 50ms, 100ms, 150ms...) |
| `maxRetries` | `5` | Maximum CAS retry attempts per batch |

### Throughput vs Latency

- **Low interval** (e.g., 50ms): Lower latency per mutation, more storage API calls
- **High interval** (e.g., 2000ms): Higher latency, but far fewer API calls (important for cost)

For production with S3, a 2-second interval batches many mutations per write, keeping costs under $1/month. See [Configuration](/deployment/configuration) for tuning.
