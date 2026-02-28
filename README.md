# osqueue

`osqueue` is a distributed job queue built on object storage with compare-and-swap (CAS) semantics.

The broker keeps queue state in a single JSON object (`queue.json`) and uses optimistic concurrency to coordinate updates.

**[Documentation](https://osqueue.com)** | **[Live Demo](https://demo.osqueue.com)**

## What Changed

- Monorepo apps are now split as:
  - `apps/osqueue`: example broker/producer/worker CLI app
  - `apps/web`: example web dashboard and controls
- Packages now compile cleanly to `dist/` and keep source in `src/`.
- Worker runtime is its own publishable package: `@osqueue/worker`.
- Client supports transport plugins: `connect`, `rest`, and `ws`.
- Error handling is now typed and tagged (`_tag`), with `isOsqueueError(...)` narrowing.
- Changesets linked versioning enforces lockstep versions for:
  - `@osqueue/client`
  - `@osqueue/broker`
  - `@osqueue/worker`

## Architecture

```text
Producers / Workers / Observers
         |
         | connect / REST / WS
         v
   +-------------+        CAS read/write        +------------------+
   |   Broker    | ---------------------------> | Object Storage   |
   |  (Fastify)  |                              | queue.json       |
   +-------------+ <--------------------------- | (S3/GCS/Memory)  |
                                                +------------------+
```

## Inspiration

This project is inspired by Turbopuffer's object-storage queue write-up:

- https://turbopuffer.com/blog/object-storage-queue

## Repository Layout

### Apps

- `apps/osqueue` (`@osqueue/example`)
  - Example CLI entrypoints for broker, producer, worker
  - `src/` source, `dist/` build output
- `apps/web` (`@osqueue/web`)
  - TanStack Start web UI
  - `app/` source, `dist/` build output

### Packages

- `packages/types`: shared types, constants, typed/tagged errors
- `packages/proto`: protobuf schema + generated Connect types
- `packages/storage`: memory, S3, and GCS backends
- `packages/core`: state machine, broker election, group-commit engine
- `packages/client`: typed queue client + transport adapter system
- `packages/worker`: worker polling/execution runtime
- `packages/broker`: broker server exposing Connect + REST + WS

## Prerequisites

- Bun 1.1+
- Node.js 20+

Notes:
- Repo scripts are run with Bun.
- Published packages are ESM and built for Node 20 runtime compatibility.

## Quick Start (Local CLI App)

```bash
bun install
```

Run each process in a separate terminal:

```bash
# broker
bun run --cwd apps/osqueue broker

# producer
bun run --cwd apps/osqueue producer

# worker
bun run --cwd apps/osqueue worker
```

Default broker URL is `http://localhost:8080`.

## Quick Start (Web App)

Option 1: run full local infra with SST dev

```bash
bunx sst dev
```

Option 2: run broker and web separately

```bash
# terminal 1
bun run --cwd apps/osqueue broker

# terminal 2
VITE_BROKER_URL=http://localhost:8080 bun run --cwd apps/web dev
```

## Client Transport Plugins

`@osqueue/client` supports:

- `connect` (default)
- `rest`
- `ws`

Example:

```ts
import { OsqueueClient } from "@osqueue/client";

const client = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "ws" }, // or { kind: "rest" } / { kind: "connect" }
});
```

You can also provide a custom adapter implementing `QueueTransportAdapter`.

## Typed Errors

All first-party runtime errors expose a literal `_tag` and class type.

Use `isOsqueueError` for narrowing:

```ts
import { isOsqueueError } from "@osqueue/types";

try {
  // queue operation
} catch (error) {
  if (isOsqueueError(error)) {
    console.error(error._tag, error.message);
  }
}
```

## Environment Variables

### `apps/osqueue`

- `BROKER_HOST` (default: `0.0.0.0`)
- `BROKER_PORT` (default: `8080`)
- `BROKER_URL` (default: `http://localhost:8080`)
- `STORAGE_BACKEND` (`memory` | `s3` | `gcs`, default: `memory`)
- `S3_BUCKET` (required for `s3` backend unless running under SST link)
- `S3_REGION`
- `S3_PREFIX`
- `GCS_BUCKET` (required for `gcs` backend)
- `GCS_PREFIX`

### `apps/web`

- `VITE_BROKER_URL` (default: `http://localhost:8080`)
- `VITE_OSQUEUE_TRANSPORT` (`connect` | `rest` | `ws`, default: `connect`)

## Development Commands

```bash
bun run lint
bun run build
bun run test
```

`bun run test` builds packages first, then runs Vitest.

## Publishing

Published packages:

- `@osqueue/client`
- `@osqueue/broker`
- `@osqueue/worker`

Versioning is linked via Changesets (`.changeset/config.json`), so these packages bump together.

Release flow:

```bash
bun run changeset
bun run release:version
bun run release:publish
```

## Deploy (AWS via SST)

```bash
bunx sst deploy --stage dev
bunx sst deploy --stage production
```

Remove stack:

```bash
bunx sst remove --stage dev
```
