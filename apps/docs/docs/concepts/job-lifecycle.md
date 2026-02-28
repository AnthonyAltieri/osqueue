---
sidebar_position: 4
---

# Job Lifecycle

## State Diagram

```
                    submit
                      │
                      ▼
               ┌─────────────┐
               │  unclaimed   │◀──────────────┐
               └──────┬──────┘               │
                      │ claim                 │ heartbeat timeout
                      ▼                       │ (attempts < maxAttempts)
               ┌─────────────┐               │
               │ in_progress  │───────────────┘
               └──────┬──────┘
                      │
              ┌───────┴───────┐
              │               │
              ▼               ▼
       ┌────────────┐  ┌───────────┐
       │ completed   │  │ exhausted │
       │ (removed)   │  │ (removed) │
       └────────────┘  └───────────┘
                        heartbeat timeout
                        + attempts >= maxAttempts
```

## Submit

A producer calls `submitJob(type, payload, maxAttempts?)`. The broker creates an enqueue mutation:

```typescript
{
  type: "enqueue",
  jobs: [{
    payload: { to: "user@example.com", subject: "Hello" },
    jobType: "email:send",
    maxAttempts: 3
  }]
}
```

The job is appended to the end of the `jobs` array with status `"unclaimed"`, a generated UUID, and `attempts: 0`.

## Claim

A worker calls `claimJob(workerId, types?)`. The broker finds the first unclaimed job matching the type filter (FIFO order) and transitions it:

- `status`: `"unclaimed"` → `"in_progress"`
- `workerId`: set to the claiming worker
- `heartbeat`: set to current timestamp
- `attempts`: incremented by 1

If no matching unclaimed job exists, the claim returns `null`.

## Heartbeat

While processing a job, the worker sends periodic heartbeat signals (default: every 5 seconds). This updates the job's `heartbeat` timestamp, telling the broker the worker is still alive.

```typescript
// Worker internally runs this on an interval:
await client.heartbeat(jobId, workerId);
```

## Complete

When the handler finishes successfully, the worker calls `completeJob(jobId, workerId)`. The job is removed from the `jobs` array and `completedTotal` is incremented.

## Expiry and Retries

On every write pass, the broker runs heartbeat expiry. For each `in_progress` job where `now - heartbeat > heartbeatTimeoutMs` (default: 30 seconds):

- If `attempts < maxAttempts` (default: 3): reset to `"unclaimed"` for retry
- If `attempts >= maxAttempts`: remove the job entirely (dropped from the array)

This handles worker crashes, network partitions, and unresponsive handlers. Jobs are automatically retried up to `maxAttempts` times before being permanently discarded.

Note: there is no explicit "fail" or "nack" operation. When a handler throws, the worker simply stops sending heartbeats for that job. The broker's expiry logic eventually detects the stale heartbeat and resets the job to `"unclaimed"` for retry.

### Payload Validation

If the worker has a Zod schema registry, claimed job payloads are validated before the handler runs. If validation fails, the job is **completed (removed)** rather than retried — this prevents invalid payloads from being retried indefinitely.

## Example Timeline

```
T=0s    Producer submits "email:send" job (attempts=0)
T=0.1s  Worker claims job (attempts=1, status=in_progress)
T=5s    Worker sends heartbeat
T=10s   Worker sends heartbeat
T=12s   Worker completes job → removed from queue

-- Or if the worker crashes: --

T=0s    Producer submits job (attempts=0)
T=0.1s  Worker claims job (attempts=1)
T=5s    Worker sends heartbeat
T=8s    Worker crashes (no more heartbeats)
T=38s   Broker detects stale heartbeat → reset to unclaimed
T=39s   Another worker claims job (attempts=2)
T=44s   Worker completes job → removed from queue
```
