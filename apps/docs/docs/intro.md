---
slug: /
sidebar_position: 1
---

# osqueue

A distributed job queue built on object storage with compare-and-swap (CAS) semantics.

osqueue stores all queue state in a single JSON file on object storage (S3, GCS, or in-memory). A central broker serializes mutations through a group-commit engine that batches writes and uses CAS operations for consistency — no database required.

Inspired by [Turbopuffer's approach](https://turbopuffer.com/blog/turbopuffer) to building on object storage, osqueue demonstrates that even coordination-heavy workloads like job queues can run entirely on blob stores.

## Features

- **Object-storage backed** — all state lives in a single `queue.json` file on S3 or GCS
- **CAS consensus** — optimistic concurrency via ETags (S3) or generations (GCS)
- **Typed jobs** — Zod schema registry for type-safe payloads and handlers
- **3 transport plugins** — Connect (gRPC), REST, and WebSocket
- **3 storage backends** — Memory, S3, and GCS
- **Broker leader election** — multiple brokers with automatic failover
- **Web dashboard** — real-time UI for monitoring and submitting jobs
- **Rate limiting** — token-bucket throttling to control storage API costs

## Quick Start

Install the client package:

```bash
npm install @osqueue/client
```

Create a client and submit a job:

```typescript
import { OsqueueClient } from "@osqueue/client";
import { z } from "zod";

const registry = {
  "email:send": z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
};

const client = new OsqueueClient(
  { brokerUrl: "http://localhost:8080" },
  registry,
);

const jobId = await client.submitJob("email:send", {
  to: "user@example.com",
  subject: "Hello",
  body: "Welcome to osqueue!",
});

console.log(`Submitted job ${jobId}`);
```

## Next Steps

- [Installation](/getting-started/installation) — prerequisites and package overview
- [Quickstart](/getting-started/quickstart) — full walkthrough with broker, producer, and worker
- [Architecture](/concepts/architecture) — how osqueue works under the hood
