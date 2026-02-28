---
sidebar_position: 5
---

# Types

Core type definitions from `@osqueue/types`.

## Queue State

### `QueueState`

The root state object stored in `queue.json`.

```typescript
interface QueueState {
  broker: string | null;
  brokerHeartbeat: number;
  jobs: Job[];
  completedTotal: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `broker` | `string \| null` | Active broker address (`host:port`) or `null` |
| `brokerHeartbeat` | `number` | Broker liveness timestamp (ms since epoch) |
| `jobs` | `Job[]` | Ordered array of active jobs (FIFO) |
| `completedTotal` | `number` | Running count of completed jobs |

### `Job`

```typescript
interface Job {
  id: JobId;
  status: JobStatus;
  payload: unknown;
  type?: string;
  heartbeat?: number;
  workerId?: WorkerId;
  createdAt: number;
  attempts: number;
  maxAttempts?: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `JobId` | Unique job identifier (UUID) |
| `status` | `JobStatus` | `"unclaimed"` or `"in_progress"` |
| `payload` | `unknown` | Job data |
| `type` | `string?` | Job type name (from registry) |
| `heartbeat` | `number?` | Last heartbeat timestamp |
| `workerId` | `WorkerId?` | Assigned worker ID |
| `createdAt` | `number` | Creation timestamp |
| `attempts` | `number` | Number of claim attempts |
| `maxAttempts` | `number?` | Maximum attempts before dropping |

### `JobStatus`

```typescript
type JobStatus = "unclaimed" | "in_progress";
```

## Mutations

### `Mutation`

```typescript
type Mutation =
  | { type: "enqueue"; jobs: Array<{ payload: unknown; jobType?: string; maxAttempts?: number }> }
  | { type: "claim"; workerId: WorkerId; jobTypes?: string[] }
  | { type: "heartbeat"; jobId: JobId; workerId: WorkerId }
  | { type: "complete"; jobId: JobId; workerId: WorkerId }
  | { type: "register_broker"; brokerAddress: string; timestamp: number };
```

### `MutationResult`

```typescript
interface MutationResult {
  claimedJob?: { id: JobId; payload: unknown; type?: string } | null;
  enqueuedIds?: JobId[];
}
```

## Branded Types

osqueue uses branded types to prevent mixing up IDs at the type level.

### `JobId`

```typescript
type JobId = Brand<string, "JobId">;
```

A UUID string branded as a job identifier. Create with:

```typescript
const id = "550e8400-e29b-41d4-a716-446655440000" as JobId;
```

### `WorkerId`

```typescript
type WorkerId = Brand<string, "WorkerId">;
```

A UUID string branded as a worker identifier.

### `Brand` Utility

```typescript
type Brand<T, B> = T & { [brand]: B };
```

Branded types are structurally compatible with their base type at runtime but distinct at compile time.

## Constants

```typescript
const QUEUE_STATE_KEY = "queue.json";
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;
const DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
```

| Constant | Value | Description |
|----------|-------|-------------|
| `QUEUE_STATE_KEY` | `"queue.json"` | Object key for the state file in storage |
| `DEFAULT_HEARTBEAT_TIMEOUT_MS` | `30000` | Job heartbeat expiry timeout |
| `DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS` | `10000` | Broker liveness timeout |
| `DEFAULT_MAX_ATTEMPTS` | `3` | Default max retry attempts per job |

## Error Classes

All error classes extend `TaggedError`. See [Typed Errors](/concepts/typed-errors) for the full catalog.

```typescript
import {
  CASConflictError,
  ConfigError,
  DiscoveryError,
  TransportConfigError,
  TransportRequestError,
  TransportConnectionError,
  StorageBackendError,
  BrokerLeadershipError,
  BrokerProtocolError,
  EngineStateError,
  WorkerExecutionError,
  isOsqueueError,
  isTaggedError,
  wrapUnknownError,
  getErrorMessage,
} from "@osqueue/types";
```

### Union Type

```typescript
type OsqueueError =
  | CASConflictError
  | ConfigError
  | DiscoveryError
  | TransportConfigError
  | TransportRequestError
  | TransportConnectionError
  | StorageBackendError
  | BrokerLeadershipError
  | BrokerProtocolError
  | EngineStateError
  | WorkerExecutionError;

type OsqueueErrorTag = OsqueueError["_tag"];
```
