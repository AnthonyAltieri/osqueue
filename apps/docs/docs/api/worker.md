---
sidebar_position: 3
---

# Worker

The worker runtime polls for jobs, validates payloads, runs handlers, and manages heartbeats and concurrency.

## Constructor

```typescript
import { Worker } from "@osqueue/worker";

const worker = new Worker(options);
```

### Options

```typescript
interface WorkerOptions<R extends JobTypeRegistry> {
  client: OsqueueClient<R>;
  workerId?: string;
  handlers: JobHandlerMap<R>;
  pollIntervalMs?: number;       // default: 1000
  heartbeatIntervalMs?: number;  // default: 5000
  concurrency?: number;          // default: 1
  onJobClaimed?: (job: ClaimedJobInfo) => void;
  onJobCompleted?: (job: ClaimedJobInfo) => void;
  onJobFailed?: (job: ClaimedJobInfo, error: unknown) => void;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `client` | — (required) | `OsqueueClient` instance |
| `workerId` | `crypto.randomUUID()` | Unique worker identifier |
| `handlers` | — (required) | Map of job type → handler function |
| `pollIntervalMs` | `1000` | How often to poll for new jobs |
| `heartbeatIntervalMs` | `5000` | How often to send heartbeats for active jobs |
| `concurrency` | `1` | Maximum concurrent jobs |
| `onJobClaimed` | — | Callback when a job is claimed |
| `onJobCompleted` | — | Callback when a job completes successfully |
| `onJobFailed` | — | Callback when a job handler throws |

## Handler Signature

```typescript
type TypedJobHandler<P> = (payload: P, signal: AbortSignal) => Promise<void>;
```

Handlers receive the validated payload and an `AbortSignal`:

```typescript
const worker = new Worker({
  client,
  handlers: {
    "email:send": async (payload, signal) => {
      // payload is typed based on the registry
      // signal is aborted when worker.stop() is called
      if (signal.aborted) return;

      await sendEmail(payload.to, payload.subject, payload.body);
    },
  },
});
```

The `AbortSignal` is triggered when `worker.stop()` is called, allowing handlers to clean up gracefully.

## Lifecycle Callbacks

```typescript
const worker = new Worker({
  client,
  handlers: { /* ... */ },
  onJobClaimed: (job) => {
    console.log(`Claimed ${job.type} job ${job.jobId}`);
  },
  onJobCompleted: (job) => {
    console.log(`Completed ${job.type} job ${job.jobId}`);
  },
  onJobFailed: (job, error) => {
    console.error(`Failed ${job.type} job ${job.jobId}:`, error);
  },
});
```

### ClaimedJobInfo

```typescript
interface ClaimedJobInfo {
  jobId: JobId;
  type: string;
  payload: unknown;
}
```

## Methods

### `start()`

Start polling for jobs.

```typescript
worker.start();
```

### `stop()`

Stop the worker gracefully. Stops polling, aborts active job signals, and waits for active jobs to finish.

```typescript
await worker.stop();
```

### `isRunning`

Whether the worker is currently running.

```typescript
worker.isRunning; // boolean
```

### `activeJobCount`

Number of jobs currently being processed.

```typescript
worker.activeJobCount; // number
```

## Execution Flow

1. **Poll**: On each interval, check if `activeJobs < concurrency`
2. **Claim**: Call `claimJob(workerId, handledTypes)` on the broker
3. **Validate**: Parse the payload against the registry schema (if available)
4. **Execute**: Run the handler with the validated payload and an `AbortSignal`
5. **Heartbeat**: Send heartbeats every `heartbeatIntervalMs` during execution
6. **Complete**: On success, call `completeJob()` to remove the job
7. **Error**: On failure, log the error and invoke `onJobFailed` (job stays in queue for retry)
8. **Reconnect**: If a request fails, attempt to reconnect to the broker

## Graceful Shutdown

```typescript
process.on("SIGINT", () => {
  worker.stop().then(() => process.exit(0));
});
```

When `stop()` is called:
1. Polling stops immediately
2. All active job `AbortSignal`s are triggered
3. Heartbeat timers are cleared
4. The method waits until `activeJobCount` reaches 0
