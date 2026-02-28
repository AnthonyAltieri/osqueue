---
sidebar_position: 2
---

# Quickstart

This walkthrough runs a complete osqueue setup locally: a broker, a producer that submits jobs, and a worker that processes them.

## 1. Define a Job Registry

Create a shared registry of job types with Zod schemas. This gives you type-safe payloads across producers and workers.

```typescript
// registry.ts
import { z } from "zod";

export const registry = {
  "email:send": z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  "report:generate": z.object({
    reportId: z.string(),
    format: z.enum(["pdf", "csv"]),
  }),
};
```

## 2. Start the Broker

The broker is the central coordinator. It manages queue state and exposes REST, WebSocket, and Connect (gRPC) endpoints.

```typescript
// broker.ts
import { BrokerServer } from "@osqueue/broker";
import { MemoryBackend } from "@osqueue/storage";

const server = new BrokerServer({
  storage: new MemoryBackend(),
  host: "0.0.0.0",
  port: 8080,
});

await server.start();
console.log(`Broker listening on ${server.address}`);

process.on("SIGINT", () => {
  server.stop().then(() => process.exit(0));
});
```

Run it:

```bash
bun run broker.ts
# Broker listening on 0.0.0.0:8080
```

## 3. Submit Jobs (Producer)

The producer creates an `OsqueueClient` and submits jobs in a loop.

```typescript
// producer.ts
import { OsqueueClient } from "@osqueue/client";
import { registry } from "./registry.js";

const client = new OsqueueClient(
  { brokerUrl: "http://localhost:8080" },
  registry,
);

const jobId = await client.submitJob("email:send", {
  to: "user@example.com",
  subject: "Hello!",
  body: "This is message #1",
});
console.log(`Submitted email:send job ${jobId}`);

const reportId = await client.submitJob("report:generate", {
  reportId: "rpt-1",
  format: "pdf",
});
console.log(`Submitted report:generate job ${reportId}`);
```

Run it:

```bash
bun run producer.ts
# Submitted email:send job 550e8400-e29b-41d4-a716-446655440000
# Submitted report:generate job 6ba7b810-9dad-11d1-80b4-00c04fd430c8
```

## 4. Process Jobs (Worker)

The worker polls for jobs, validates payloads against the registry, and runs handlers.

```typescript
// worker.ts
import { OsqueueClient } from "@osqueue/client";
import { Worker } from "@osqueue/worker";
import { registry } from "./registry.js";

const client = new OsqueueClient(
  { brokerUrl: "http://localhost:8080" },
  registry,
);

const worker = new Worker({
  client,
  handlers: {
    "email:send": async (payload) => {
      console.log(`Sending email to ${payload.to}: "${payload.subject}"`);
      // payload is typed as { to: string; subject: string; body: string }
    },
    "report:generate": async (payload) => {
      console.log(`Generating ${payload.format} report ${payload.reportId}`);
      // payload is typed as { reportId: string; format: "pdf" | "csv" }
    },
  },
});

worker.start();
console.log("Worker started, polling for jobs...");

process.on("SIGINT", () => {
  worker.stop().then(() => process.exit(0));
});
```

Run it:

```bash
bun run worker.ts
# Worker started, polling for jobs...
# Sending email to user@example.com: "Hello!"
# Generating pdf report rpt-1
```

## What's Happening

```
┌──────────┐     ┌──────────┐     ┌───────────────┐
│ Producer │────▶│  Broker  │◀────│    Worker     │
│          │     │          │     │               │
│ submit() │     │ enqueue  │     │ claim()       │
│          │     │ claim    │     │ heartbeat()   │
│          │     │ complete │     │ complete()    │
└──────────┘     └────┬─────┘     └───────────────┘
                      │
                      ▼
               ┌─────────────┐
               │   Storage   │
               │ queue.json  │
               └─────────────┘
```

1. The **producer** calls `submitJob()` which sends a request to the broker
2. The **broker** batches the enqueue mutation and writes it to `queue.json` via CAS
3. The **worker** polls `claimJob()`, the broker assigns the first unclaimed job
4. The worker runs the handler, sending periodic heartbeats
5. On completion, the worker calls `completeJob()` and the job is removed from the queue
