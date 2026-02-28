---
sidebar_position: 3
---

# Broker Election

## The Problem

Only one broker should write to the queue state at a time. Multiple active writers would cause constant CAS conflicts and potential data corruption. osqueue solves this with CAS-based leader election.

## How Election Works

The broker's address and heartbeat timestamp are stored in `queue.json` alongside job data:

```json
{
  "broker": "0.0.0.0:8080",
  "brokerHeartbeat": 1706000000000,
  "jobs": []
}
```

### Election Flow

When a broker starts, it calls `tryElect()`:

1. Read `queue.json` from storage
2. If no state exists, create it with this broker as leader (via `createIfNotExists`)
3. If state exists and the registered broker is this broker with a fresh heartbeat → `"already_leader"`
4. If another broker has a fresh heartbeat → `"other_leader"` (back off)
5. If the registered broker's heartbeat is stale (older than `heartbeatTimeoutMs`) → attempt takeover via CAS write
6. If the CAS write succeeds → `"elected"`
7. If the CAS write fails (another broker won the race) → `"conflict"`

```typescript
type ElectionResult =
  | { status: "elected" }
  | { status: "already_leader" }
  | { status: "other_leader"; leader: string }
  | { status: "conflict" };
```

### Heartbeat-Based Liveness

The active broker periodically writes a `register_broker` mutation to update its heartbeat timestamp. The default heartbeat interval is 3 seconds, and the timeout is 10 seconds.

If a broker crashes or becomes unreachable, its heartbeat goes stale. A standby broker detects this and takes over.

### Failover Sequence

```
Time ──────────────────────────────────────────────▶

Broker A:  [elected] ──heartbeat──heartbeat── ✖ crash
                                                 │
Broker B:  [other_leader]─────retry(10s)─────────┤
                                                 │
           heartbeat stale (>10s)                │
                                                 ▼
Broker B:  ────────────────────────────── [elected]
```

In the default production entrypoint, two brokers run simultaneously on ports 8080 and 8081. One becomes leader; the other retries every 10 seconds. If the leader dies, the standby takes over within one retry cycle.

### Leadership Checks

The active broker also periodically reads state to verify it's still the leader:

```typescript
const isLeader = await election.checkLeadership();
if (!isLeader) {
  console.log("Lost leadership — shutting down");
  await server.stop();
}
```

This prevents split-brain: if a network partition resolves and another broker took over, the old leader self-demotes.
