---
sidebar_position: 1
---

# Architecture

## High-Level Overview

```
┌──────────┐  ┌──────────┐     ┌───────────────────────┐     ┌─────────────┐
│ Producer │  │ Producer │     │        Broker         │     │   Storage   │
│          │  │          │────▶│                       │────▶│             │
│ submit() │  │ submit() │     │  GroupCommitEngine    │     │ queue.json  │
└──────────┘  └──────────┘     │  ┌─────────────────┐  │     │             │
                               │  │ Mutation Buffer  │  │     │  S3 / GCS   │
┌──────────┐  ┌──────────┐     │  │ CAS Write Loop   │  │     │  / Memory   │
│  Worker  │  │  Worker  │     │  └─────────────────┘  │     └─────────────┘
│          │  │          │────▶│                       │
│ claim()  │  │ claim()  │     │  BrokerElection       │
│ complete │  │ complete │     │  REST / WS / Connect  │
└──────────┘  └──────────┘     └───────────────────────┘
```

## Single-Blob Design

osqueue stores all queue state in a single JSON file (`queue.json`) on object storage. This file contains:

```json
{
  "broker": "0.0.0.0:8080",
  "brokerHeartbeat": 1706000000000,
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "unclaimed",
      "type": "email:send",
      "payload": { "to": "user@example.com", "subject": "Hello" },
      "createdAt": 1706000000000,
      "attempts": 0
    }
  ],
  "completedTotal": 42
}
```

Every mutation (enqueue, claim, heartbeat, complete) modifies this single file through a compare-and-swap (CAS) operation. This eliminates the need for a database while maintaining consistency.

## Why Object Storage?

- **Simplicity** — no database to manage, migrate, or scale
- **Cost** — S3/GCS storage is extremely cheap ($0.023/GB/month)
- **Durability** — 11 nines of durability
- **Serverless-friendly** — no persistent connections needed for state

The tradeoff is throughput: object storage has higher per-request latency than a database. osqueue mitigates this with group-commit batching (see [How It Works](/concepts/how-it-works)).

## Package Dependency Graph

```
@osqueue/types          ← Shared types, errors, constants
    ↑
@osqueue/proto          ← Protocol buffer definitions
    ↑
@osqueue/storage        ← S3, GCS, Memory backends
    ↑
@osqueue/core           ← State machine, election, group-commit
    ↑
┌───┴────┬──────────┐
│        │          │
@osqueue/client    @osqueue/broker
    ↑               ↑
@osqueue/worker     │
                    │
              apps/osqueue (example CLI)
              apps/web (dashboard)
```

The packages are designed for independent installation. A producer only needs `@osqueue/client`. A worker needs `@osqueue/client` + `@osqueue/worker`. Only the broker process needs `@osqueue/broker` + `@osqueue/storage`.
