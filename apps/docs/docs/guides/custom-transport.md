---
sidebar_position: 6
---

# Custom Transport

You can implement the `QueueTransportAdapter` interface to add custom transport protocols beyond the built-in Connect, REST, and WebSocket options.

## The Interface

```typescript
import type { GetStatsResponse, ListJobsResponse } from "@osqueue/proto";

interface QueueTransportAdapter {
  submitJob(req: SubmitJobRequest): Promise<{ jobId: string }>;
  claimJob(req: ClaimJobRequest): Promise<ClaimJobResult>;
  heartbeat(req: HeartbeatRequest): Promise<void>;
  completeJob(req: CompleteJobRequest): Promise<void>;
  getStats(): Promise<GetStatsResponse>;
  listJobs(): Promise<ListJobsResponse>;
  reconnect?(): Promise<void>;
  close?(): Promise<void>;
}

interface SubmitJobRequest {
  type: string;
  payload: unknown;
  maxAttempts?: number;
}

interface ClaimJobRequest {
  workerId: string;
  types?: string[];
}

interface ClaimJobResult {
  jobId?: string;
  type: string;
  payload: unknown | null;
}

interface HeartbeatRequest {
  jobId: string;
  workerId: string;
}

interface CompleteJobRequest {
  jobId: string;
  workerId: string;
}
```

## Implementation Steps

### 1. Implement the 6 Required Methods

Each method maps to a broker operation:

- `submitJob` → `POST /v1/jobs` or equivalent
- `claimJob` → `POST /v1/jobs/claim`
- `heartbeat` → `POST /v1/jobs/:jobId/heartbeat`
- `completeJob` → `POST /v1/jobs/:jobId/complete`
- `getStats` → `GET /v1/stats`
- `listJobs` → `GET /v1/jobs`

### 2. Handle Errors

Throw `TransportRequestError` or `TransportConnectionError` from `@osqueue/types` so the worker's retry logic works correctly:

```typescript
import {
  TransportRequestError,
  TransportConnectionError,
} from "@osqueue/types";

// On connection failure:
throw new TransportConnectionError("Redis connection lost");

// On request failure:
throw new TransportRequestError("Request failed", {
  method: "submitJob",
  status: 500,
});
```

### 3. Optional: Implement Reconnect and Close

- `reconnect()` — called by the worker when a request fails. Re-establish the connection.
- `close()` — called during cleanup. Release resources.

### 4. Plug Into OsqueueClient

Pass your adapter directly as the `transport` option:

```typescript
import { OsqueueClient } from "@osqueue/client";

const adapter = new MyCustomAdapter("redis://localhost:6379");

const client = new OsqueueClient({
  transport: adapter,
});
```

The client detects that the value implements `QueueTransportAdapter` (duck-typing on `submitJob`) and uses it directly.

## Example: HTTP Polling Adapter

A minimal example showing the pattern:

```typescript
import type { QueueTransportAdapter } from "@osqueue/client";
import { TransportRequestError } from "@osqueue/types";

class HttpPollingAdapter implements QueueTransportAdapter {
  constructor(private baseUrl: string) {}

  async submitJob(req) {
    const res = await fetch(`${this.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new TransportRequestError(`Submit failed: ${res.status}`, {
        method: "POST",
        path: "/v1/jobs",
        status: res.status,
      });
    }
    return await res.json();
  }

  async claimJob(req) {
    const res = await fetch(`${this.baseUrl}/v1/jobs/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new TransportRequestError("Claim failed");
    return await res.json();
  }

  async heartbeat(req) {
    await fetch(`${this.baseUrl}/v1/jobs/${req.jobId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: req.workerId }),
    });
  }

  async completeJob(req) {
    await fetch(`${this.baseUrl}/v1/jobs/${req.jobId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: req.workerId }),
    });
  }

  async getStats() {
    const res = await fetch(`${this.baseUrl}/v1/stats`);
    return await res.json();
  }

  async listJobs() {
    const res = await fetch(`${this.baseUrl}/v1/jobs`);
    return await res.json();
  }
}
```
