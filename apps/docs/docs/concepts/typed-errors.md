---
sidebar_position: 5
---

# Typed Errors

osqueue uses a tagged error system for precise error identification across packages. All errors extend `TaggedError` with a `_tag` discriminant field.

## TaggedError Base Class

```typescript
abstract class TaggedError<TTag extends string> extends Error {
  readonly _tag: TTag;
}
```

Every osqueue error has a unique `_tag` string that identifies the error type. This enables pattern matching without `instanceof` checks (useful across package boundaries or serialization).

## Error Catalog

All error classes are **defined** in `@osqueue/types` but **thrown** by their respective packages.

| Tag | Class | Thrown By | When Thrown |
|-----|-------|-----------|------------|
| `CASConflictError` | `CASConflictError` | storage | Storage version mismatch during CAS write |
| `ConfigError` | `ConfigError` | types | Invalid configuration (missing env vars, bad values) |
| `DiscoveryError` | `DiscoveryError` | client | Cannot find broker via storage or config |
| `TransportConfigError` | `TransportConfigError` | client | Invalid transport configuration |
| `TransportRequestError` | `TransportRequestError` | client | HTTP/WS request failed (includes method, path, status) |
| `TransportConnectionError` | `TransportConnectionError` | client | Cannot connect to broker |
| `StorageBackendError` | `StorageBackendError` | storage | Storage I/O failure |
| `BrokerLeadershipError` | `BrokerLeadershipError` | broker | Election failure or leadership lost |
| `BrokerProtocolError` | `BrokerProtocolError` | broker | Invalid request or unsupported WS method |
| `EngineStateError` | `EngineStateError` | core | Group-commit engine failure |
| `WorkerExecutionError` | `WorkerExecutionError` | worker | Job handler threw an error |

## Type Narrowing

### `isOsqueueError()`

Checks if an unknown value is any osqueue error:

```typescript
import { isOsqueueError } from "@osqueue/types";

try {
  await client.submitJob("email:send", payload);
} catch (error) {
  if (isOsqueueError(error)) {
    // error is narrowed to OsqueueError union
    console.error(`[${error._tag}] ${error.message}`);
  }
}
```

### `isTaggedError()`

Checks if a value is any `TaggedError` (including non-osqueue tagged errors):

```typescript
import { isTaggedError } from "@osqueue/types";

if (isTaggedError(error)) {
  console.log(error._tag); // string
}
```

## TransportRequestError Details

`TransportRequestError` includes extra context about the failed request:

```typescript
import { TransportRequestError } from "@osqueue/types";

if (error instanceof TransportRequestError) {
  console.log(error.method);    // "POST"
  console.log(error.path);      // "/v1/jobs"
  console.log(error.status);    // 500
  console.log(error.remoteTag); // "_tag from server error response"
}
```

## BrokerLeadershipError Details

`BrokerLeadershipError` includes the current leader's address:

```typescript
import { BrokerLeadershipError } from "@osqueue/types";

if (error instanceof BrokerLeadershipError) {
  console.log(error.leader);   // "0.0.0.0:8080" (the active broker)
}
```

## BrokerProtocolError Details

`BrokerProtocolError` includes the method that failed:

```typescript
import { BrokerProtocolError } from "@osqueue/types";

if (error instanceof BrokerProtocolError) {
  console.log(error.method);   // "invalidMethod"
}
```

## `wrapUnknownError()`

Converts unknown errors (from third-party libraries) into tagged errors:

```typescript
import { wrapUnknownError, BrokerProtocolError } from "@osqueue/types";

try {
  await someExternalCall();
} catch (err) {
  const tagged = wrapUnknownError(
    err,
    (message, cause) => new BrokerProtocolError(message, { cause }),
  );
  // If err was already a TaggedError, returns it as-is
  // Otherwise wraps it in a BrokerProtocolError
}
```

## Error Responses

When the broker returns errors over REST or WebSocket, they include the `_tag` and `message`:

```json
{
  "_tag": "BrokerProtocolError",
  "message": "Unsupported WS method: invalidMethod"
}
```

This allows clients to match on `_tag` for programmatic error handling.
