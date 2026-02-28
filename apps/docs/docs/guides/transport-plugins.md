---
sidebar_position: 2
---

# Transport Plugins

osqueue supports three transport protocols between clients/workers and the broker. All three expose the same operations; they differ in protocol, performance characteristics, and environment support.

## Comparison

| Feature | Connect (gRPC) | REST | WebSocket |
|---------|----------------|------|-----------|
| Protocol | HTTP/1.1 or HTTP/2 | HTTP/1.1 | WS |
| Serialization | Protobuf | JSON | JSON-RPC |
| Browser support | Via Connect Web | Yes | Yes |
| Streaming | No (unary only) | No | Persistent connection |
| Default | Yes | No | No |

## Connect (Default)

Uses [Connect](https://connectrpc.com/) with Protocol Buffers. This is the default transport.

```typescript
import { OsqueueClient } from "@osqueue/client";

// Default: Connect transport, HTTP/1.1
const client = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
});

// Explicit Connect config
const client2 = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "connect", httpVersion: "2" },
});
```

**When to use**: Server-to-server communication, best type safety with protobuf schemas.

## REST

Simple HTTP POST/GET requests with JSON bodies.

```typescript
const client = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "rest" },
});

// With custom fetch implementation
const client2 = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: { kind: "rest", fetchImpl: customFetch },
});
```

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/jobs` | Submit a job |
| `POST` | `/v1/jobs/claim` | Claim a job |
| `POST` | `/v1/jobs/:jobId/heartbeat` | Send heartbeat |
| `POST` | `/v1/jobs/:jobId/complete` | Complete a job |
| `GET` | `/v1/stats` | Get queue statistics |
| `GET` | `/v1/jobs` | List all jobs |

**When to use**: Simple integrations, debugging with curl, environments where protobuf is unavailable.

## WebSocket

Persistent WebSocket connection with JSON-RPC messages.

```typescript
const client = new OsqueueClient({
  brokerUrl: "http://localhost:8080",
  transport: {
    kind: "ws",
    requestTimeoutMs: 10000,  // default: 10s
    wsPath: "/v1/ws",         // default
  },
});
```

**Message format**:

```json
// Request
{ "id": 1, "method": "submitJob", "params": { "type": "email:send", "payload": {} } }

// Success response
{ "id": 1, "ok": true, "result": { "jobId": "..." } }

// Error response
{ "id": 1, "ok": false, "error": { "_tag": "BrokerProtocolError", "message": "..." } }
```

**Available methods**: `submitJob`, `claimJob`, `heartbeat`, `completeJob`, `getStats`, `listJobs`

**When to use**: Long-lived workers that benefit from a persistent connection, browser dashboards.

## Browser Considerations

For browser-based clients (like the web dashboard):

- **Connect Web**: Use `@connectrpc/connect-web` with `createConnectTransport` for browser-compatible Connect
- **REST**: Works natively with browser `fetch`
- **WebSocket**: Works with browser `WebSocket` API

The web dashboard defaults to Connect Web transport. Override with `VITE_OSQUEUE_TRANSPORT=rest` or `VITE_OSQUEUE_TRANSPORT=ws`.

## Custom Transport

You can implement the `QueueTransportAdapter` interface for custom protocols. See [Custom Transport](/guides/custom-transport).
