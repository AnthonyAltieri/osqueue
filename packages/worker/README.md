# @osqueue/worker

Worker runtime for osqueue.

`@osqueue/worker` polls jobs from `@osqueue/client`, runs typed handlers, heartbeats in-flight jobs, and completes successful jobs.

## Install

```bash
npm i @osqueue/worker @osqueue/client zod
```

Runtime target: Node.js 20+ (ESM).

## Quick Start

```ts
import { z } from "zod";
import { OsqueueClient } from "@osqueue/client";
import { Worker } from "@osqueue/worker";

const registry = {
  "email:send": z.object({
    to: z.string(),
    subject: z.string(),
  }),
};

const client = new OsqueueClient(
  { brokerUrl: "http://localhost:8080" },
  registry,
);

const worker = new Worker({
  client,
  handlers: {
    "email:send": async (payload) => {
      console.log(`Send email to ${payload.to}: ${payload.subject}`);
    },
  },
});

worker.start();
```

Stop and drain:

```ts
await worker.stop();
```

## WorkerOptions

- `client` (required): `OsqueueClient`
- `handlers` (required): map from job type to async handler
- `workerId` (default: random UUID)
- `pollIntervalMs` (default: `1000`)
- `heartbeatIntervalMs` (default: `5000`)
- `concurrency` (default: `1`)
- `onJobClaimed(job)`
- `onJobCompleted(job)`
- `onJobFailed(job, error)`

## Handler Signature

Each handler receives:

- validated payload (if schema exists in client registry)
- `AbortSignal`

```ts
type TypedJobHandler<P> = (payload: P, signal: AbortSignal) => Promise<void>;
```

## Runtime Behavior

- Claims jobs filtered by handler keys.
- Validates payload against client registry schema (if present).
- Sends heartbeats while handler is running.
- Completes jobs on success.
- On claim/transport failures, attempts client reconnect and retries on next poll cycle.

## Inspiration

Inspired by:

- https://turbopuffer.com/blog/object-storage-queue
