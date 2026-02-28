---
sidebar_position: 2
---

# BrokerServer

The central broker that manages queue state. Runs a Fastify server with REST, WebSocket, and Connect (gRPC) endpoints.

## Constructor

```typescript
import { BrokerServer } from "@osqueue/broker";

const server = new BrokerServer(options);
```

### Options

```typescript
interface BrokerServerOptions {
  storage: StorageBackend;
  host?: string;               // default: "0.0.0.0"
  port?: number;               // default: 8080
  heartbeatIntervalMs?: number;     // default: 3000
  heartbeatTimeoutMs?: number;      // default: 10000
  groupCommitIntervalMs?: number;   // default: 50
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `storage` | — (required) | Storage backend for queue state |
| `host` | `"0.0.0.0"` | Bind address |
| `port` | `8080` | Listen port |
| `heartbeatIntervalMs` | `3000` | How often the broker registers itself |
| `heartbeatTimeoutMs` | `10000` | How long before another broker's heartbeat is considered stale |
| `groupCommitIntervalMs` | `50` | Write loop interval for batching mutations |

## Methods

### `start()`

Start the broker server. Runs leader election, starts the group-commit engine, and begins listening.

```typescript
await server.start();
```

Throws `BrokerLeadershipError` if another broker is already active.

### `stop()`

Stop the broker. Stops the group-commit engine, clears heartbeat timers, and closes the Fastify server.

```typescript
await server.stop();
```

### `address`

The broker's address string (`host:port`).

```typescript
console.log(server.address); // "0.0.0.0:8080"
```

### `isRunning`

Whether the broker is currently running.

```typescript
if (server.isRunning) { /* ... */ }
```

## REST Endpoints

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| `GET` | `/healthz` | — | `{"status":"ok"}` |
| `GET` | `/state` | — | Raw `QueueState` JSON |
| `POST` | `/v1/jobs` | `{payload, type?, maxAttempts?}` | `{jobId}` |
| `POST` | `/v1/jobs/claim` | `{workerId, types?}` | `{jobId?, payload?, type?}` |
| `POST` | `/v1/jobs/:jobId/heartbeat` | `{workerId}` | 204 No Content |
| `POST` | `/v1/jobs/:jobId/complete` | `{workerId}` | 204 No Content |
| `GET` | `/v1/stats` | — | `{total, unclaimed, inProgress, completedTotal, brokerAddress}` |
| `GET` | `/v1/jobs` | — | `{jobs[], total, unclaimed, inProgress, completedTotal, brokerAddress}` |
| `GET` | `/v1/throttle-stats` | — | Throttle stats or `{throttling: false}` |

## WebSocket Protocol

Connect to `GET /v1/ws` for a WebSocket connection using JSON-RPC messages.

### Request Format

```json
{
  "id": 1,
  "method": "submitJob",
  "params": {
    "type": "email:send",
    "payload": { "to": "user@example.com" },
    "maxAttempts": 3
  }
}
```

### Response Format

```json
// Success
{ "id": 1, "ok": true, "result": { "jobId": "..." } }

// Error
{ "id": 1, "ok": false, "error": { "_tag": "BrokerProtocolError", "message": "..." } }
```

### Available Methods

| Method | Params | Result |
|--------|--------|--------|
| `submitJob` | `{payload, type?, maxAttempts?}` | `{jobId}` |
| `claimJob` | `{workerId, types?}` | `{jobId?, payload?, type?}` |
| `heartbeat` | `{jobId, workerId}` | `{}` |
| `completeJob` | `{jobId, workerId}` | `{}` |
| `getStats` | `{}` | `{total, unclaimed, inProgress, completedTotal, brokerAddress}` |
| `listJobs` | `{}` | `{jobs[], total, unclaimed, ...}` |

## Connect (gRPC)

The broker registers the `QueueService` at the `/osqueue.v1.QueueService` prefix. Use the `@osqueue/proto` package for generated types and the `@connectrpc/connect` client to call these.

### RPC Methods

| RPC | Request | Response |
|-----|---------|----------|
| `SubmitJob` | `{payload, max_attempts, type}` | `{job_id}` |
| `ClaimJob` | `{worker_id, types}` | `{job_id?, payload?, type}` |
| `Heartbeat` | `{job_id, worker_id}` | `{}` |
| `CompleteJob` | `{job_id, worker_id}` | `{}` |
| `GetStats` | `{}` | `{total, unclaimed, in_progress, broker_address}` |
| `ListJobs` | `{}` | `{jobs[], total, unclaimed, in_progress, completed_total, broker_address}` |

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "_tag": "BrokerProtocolError",
  "message": "Description of what went wrong"
}
```

The `_tag` field enables programmatic error handling on the client side.
