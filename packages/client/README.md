# @osqueue/client

Typed queue client for osqueue with pluggable transports.

Supported built-in transports:

- `connect` (default)
- `rest`
- `ws`

## Install

```bash
npm i @osqueue/client zod
```

Runtime target: Node.js 20+ (ESM).

## Quick Start

```ts
import { z } from "zod";
import { OsqueueClient } from "@osqueue/client";

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
  body: "Welcome",
});

console.log(jobId);
```

## Transport Configuration

Default (`connect`):

```ts
new OsqueueClient({ brokerUrl: "http://localhost:8080" });
```

REST:

```ts
new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "rest" },
});
```

WebSocket:

```ts
new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "ws", requestTimeoutMs: 10_000, wsPath: "/v1/ws" },
});
```

Custom adapter:

```ts
import type { QueueTransportAdapter } from "@osqueue/client";
```

Pass your adapter to `transport` in `OsqueueClient` options.

## Broker Discovery

If you do not provide `brokerUrl`, client can discover broker via storage state:

```ts
new OsqueueClient({ storage });
```

This reads `queue.json` and connects to the registered broker.

## API

Main class:

- `OsqueueClient`
  - `submitJob(type, payload, maxAttempts?)`
  - `claimJob(workerId, types?)`
  - `heartbeat(jobId, workerId)`
  - `completeJob(jobId, workerId)`
  - `getStats()`
  - `listJobs()`
  - `connect()`
  - `reconnect()`

Exports:

- `OsqueueClientOptions`
- `JobTypeRegistry`
- `QueueTransportAdapter`
- `createConnectAdapter`
- `createRestAdapter`
- `createWsAdapter`

## Errors

Errors are tagged and compatible with `isOsqueueError` from `@osqueue/types`.

Common client-side tags:

- `DiscoveryError`
- `TransportConfigError`
- `TransportConnectionError`
- `TransportRequestError`

## Inspiration

Inspired by:

- https://turbopuffer.com/blog/object-storage-queue
