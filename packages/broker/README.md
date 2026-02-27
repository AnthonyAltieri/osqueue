# @osqueue/broker

Broker server for osqueue.

The broker coordinates queue state updates through `@osqueue/core` and a shared storage backend, and exposes:

- ConnectRPC
- REST API
- WebSocket API

## Install

```bash
npm i @osqueue/broker @osqueue/storage
```

Runtime target: Node.js 20+ (ESM).

## Quick Start

```ts
import { BrokerServer } from "@osqueue/broker";
import { MemoryBackend } from "@osqueue/storage";

const broker = new BrokerServer({
  storage: new MemoryBackend(),
  host: "0.0.0.0",
  port: 8080,
});

await broker.start();
console.log(`Broker listening on ${broker.address}`);
```

Graceful shutdown:

```ts
await broker.stop();
```

## Configuration

`BrokerServerOptions`:

- `storage` (required): object implementing `StorageBackend`
- `host` (default `0.0.0.0`)
- `port` (default `8080`)
- `heartbeatIntervalMs` (default `3000`)
- `heartbeatTimeoutMs` (default `10000`)
- `groupCommitIntervalMs` (default `50`)

## REST API

- `GET /healthz`
- `GET /state`
- `POST /v1/jobs`
- `POST /v1/jobs/claim`
- `POST /v1/jobs/:jobId/heartbeat`
- `POST /v1/jobs/:jobId/complete`
- `GET /v1/stats`
- `GET /v1/jobs`

## WebSocket API

Endpoint:

- `GET /v1/ws` (websocket upgrade)

Request format:

```json
{ "id": "1", "method": "submitJob", "params": {} }
```

Supported methods:

- `submitJob`
- `claimJob`
- `heartbeat`
- `completeJob`
- `getStats`
- `listJobs`

Response format:

```json
{ "id": "1", "ok": true, "result": {} }
```

Error format:

```json
{ "id": "1", "ok": false, "error": { "_tag": "BrokerProtocolError", "message": "..." } }
```

## Error Semantics

Broker emits tagged errors (`_tag`) in REST and WS error responses where applicable.

Common tags:

- `BrokerLeadershipError`
- `BrokerProtocolError`

## Inspiration

Inspired by:

- https://turbopuffer.com/blog/object-storage-queue
