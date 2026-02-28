---
sidebar_position: 1
---

# OsqueueClient

The client for submitting and managing jobs. Supports pluggable transport protocols and typed job registries.

## Constructor

```typescript
import { OsqueueClient } from "@osqueue/client";

const client = new OsqueueClient(options?, registry?);
```

### Options

```typescript
interface OsqueueClientOptions {
  brokerUrl?: string;
  storage?: StorageBackend;
  transport?: Transport | BuiltinTransportConfig | QueueTransportAdapter;
  discoveryRetryMs?: number;   // default: 2000
  httpVersion?: "1.1" | "2";   // default: "1.1"
}
```

| Option | Description |
|--------|-------------|
| `brokerUrl` | Direct URL to the broker (e.g., `"http://localhost:8080"`) |
| `storage` | Storage backend for broker discovery (reads `queue.json` to find broker address) |
| `transport` | Transport configuration — Connect transport, built-in config, or custom adapter |
| `discoveryRetryMs` | Delay between discovery retries |
| `httpVersion` | HTTP version for Connect transport |

You must provide either `brokerUrl`, a `transport` adapter, or `storage` (for discovery).

### Registry

```typescript
type JobTypeRegistry = Record<string, z.ZodType>;
```

Pass a Zod schema registry as the second argument for type-safe `submitJob` and handler payloads:

```typescript
const registry = {
  "email:send": z.object({ to: z.string(), subject: z.string(), body: z.string() }),
};

const client = new OsqueueClient({ brokerUrl: "http://localhost:8080" }, registry);
```

## Methods

### `submitJob(type, payload, maxAttempts?)`

Submit a new job to the queue.

```typescript
const jobId: JobId = await client.submitJob("email:send", {
  to: "user@example.com",
  subject: "Hello",
  body: "Welcome!",
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `string & keyof R` | Job type name (must be a key in the registry) |
| `payload` | `z.infer<R[T]>` | Job payload (typed by the registry schema) |
| `maxAttempts` | `number?` | Maximum retry attempts (default: 3) |

**Returns**: `Promise<JobId>`

### `claimJob(workerId, types?)`

Claim the next available job.

```typescript
const result = await client.claimJob(workerId, ["email:send"]);
if (result) {
  console.log(result.jobId, result.type, result.payload);
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `workerId` | `WorkerId` | The claiming worker's ID |
| `types` | `string[]?` | Filter by job types (claim any type if omitted) |

**Returns**: `Promise<{ jobId: JobId; type: string; payload: unknown } | null>`

### `heartbeat(jobId, workerId)`

Send a heartbeat for an in-progress job.

```typescript
await client.heartbeat(jobId, workerId);
```

### `completeJob(jobId, workerId)`

Mark a job as completed (removes it from the queue).

```typescript
await client.completeJob(jobId, workerId);
```

### `getStats()`

Get queue statistics.

```typescript
const stats = await client.getStats();
// { total, unclaimed, inProgress, completedTotal, brokerAddress }
```

### `listJobs()`

List all jobs with details.

```typescript
const result = await client.listJobs();
// { jobs: [...], total, unclaimed, inProgress, completedTotal, brokerAddress }
```

### `connect()`

Discover the broker via storage (reads `queue.json`). Called automatically on first operation if `storage` was provided.

```typescript
await client.connect();
```

### `reconnect()`

Reconnect to the broker. If the transport adapter has a `reconnect()` method, calls it. Otherwise re-creates the adapter.

```typescript
await client.reconnect();
```

## Transport Adapter Factories

```typescript
import {
  createConnectAdapter,
  createRestAdapter,
  createWsAdapter,
} from "@osqueue/client";
```

### `createConnectAdapter(config)`

```typescript
createConnectAdapter({
  kind: "connect",
  baseUrl: "http://localhost:8080",
  httpVersion: "1.1",    // or "2"
  transport: customTransport,  // optional Connect Transport
});
```

### `createRestAdapter(config)`

```typescript
createRestAdapter({
  kind: "rest",
  baseUrl: "http://localhost:8080",
  fetchImpl: customFetch,  // optional
});
```

### `createWsAdapter(config)`

```typescript
createWsAdapter({
  kind: "ws",
  baseUrl: "http://localhost:8080",
  requestTimeoutMs: 10000,  // default
  wsPath: "/v1/ws",         // default
});
```
