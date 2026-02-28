---
sidebar_position: 1
---

# Job Types

osqueue uses Zod schemas for type-safe job payloads. A **job type registry** maps string type names to Zod schemas, giving you compile-time type checking for both producers and workers.

## Defining a Registry

```typescript
import { z } from "zod";

export const registry = {
  "email:send": z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  "report:generate": z.object({
    reportId: z.string(),
    format: z.enum(["pdf", "csv"]),
  }),
};
```

The registry is a plain object where keys are job type names and values are Zod schemas.

## Type-Safe Submission

Pass the registry as the second argument to `OsqueueClient`:

```typescript
import { OsqueueClient } from "@osqueue/client";
import { registry } from "./registry.js";

const client = new OsqueueClient(
  { brokerUrl: "http://localhost:8080" },
  registry,
);

// TypeScript knows the payload shape for "email:send"
await client.submitJob("email:send", {
  to: "user@example.com",
  subject: "Hello",
  body: "Welcome!",
});

// Type error: 'invalid' is not a key of the registry
// await client.submitJob("invalid", {});

// Type error: missing required field 'body'
// await client.submitJob("email:send", { to: "a@b.com", subject: "Hi" });
```

## Type-Safe Handlers

The `Worker` uses the same registry for handler type inference:

```typescript
import { Worker } from "@osqueue/worker";

const worker = new Worker({
  client,
  handlers: {
    "email:send": async (payload) => {
      // payload: { to: string; subject: string; body: string }
      console.log(`Sending to ${payload.to}`);
    },
    "report:generate": async (payload) => {
      // payload: { reportId: string; format: "pdf" | "csv" }
      console.log(`Format: ${payload.format}`);
    },
  },
});
```

## Runtime Validation

When a worker claims a job, the payload is validated against the registry schema at runtime:

1. Worker claims a job and receives the raw payload
2. If a schema exists for the job type, `schema.safeParse(payload)` runs
3. If validation fails, the job is completed (removed) and an error is logged
4. If validation passes, the validated data is passed to the handler

This catches payload corruption or schema mismatches between producers and workers.

## Adding New Job Types

To add a new job type to an existing system:

1. Add the schema to the shared registry
2. Add a handler in the worker
3. Start submitting jobs with the new type

Workers only claim jobs for types they have handlers for (via the `types` filter on `claimJob`), so you can deploy the new worker handler before producers start submitting the new type.

## Registry Type

The registry type is exported for use in shared type definitions:

```typescript
import type { JobTypeRegistry } from "@osqueue/client";

// JobTypeRegistry = Record<string, z.ZodType>
```
