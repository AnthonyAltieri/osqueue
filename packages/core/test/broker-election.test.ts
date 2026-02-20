import { describe, test, expect } from "bun:test";
import { BrokerElection } from "../src/broker-election.js";
import { MemoryBackend } from "@osqueue/storage";
import { QUEUE_STATE_KEY } from "@osqueue/types";
import type { QueueState } from "@osqueue/types";
import { emptyState, registerBroker } from "../src/state.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readState(backend: MemoryBackend): Promise<QueueState> {
  const result = await backend.read(QUEUE_STATE_KEY);
  if (!result) throw new Error("No state");
  return JSON.parse(decoder.decode(result.data));
}

describe("BrokerElection", () => {
  test("elects on empty storage", async () => {
    const backend = new MemoryBackend();
    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-1:8080",
      heartbeatTimeoutMs: 5000,
    });

    const result = await election.tryElect(1000);
    expect(result.status).toBe("elected");

    const state = await readState(backend);
    expect(state.broker).toBe("broker-1:8080");
    expect(state.brokerHeartbeat).toBe(1000);
  });

  test("returns already_leader when already the broker", async () => {
    const backend = new MemoryBackend();
    const state = registerBroker(emptyState(), "broker-1:8080", 1000);
    await backend.createIfNotExists(
      QUEUE_STATE_KEY,
      encoder.encode(JSON.stringify(state)),
    );

    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-1:8080",
      heartbeatTimeoutMs: 5000,
    });

    const result = await election.tryElect(2000);
    expect(result.status).toBe("already_leader");
  });

  test("returns other_leader when another broker is active", async () => {
    const backend = new MemoryBackend();
    const state = registerBroker(emptyState(), "broker-1:8080", 1000);
    await backend.createIfNotExists(
      QUEUE_STATE_KEY,
      encoder.encode(JSON.stringify(state)),
    );

    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-2:8080",
      heartbeatTimeoutMs: 5000,
    });

    const result = await election.tryElect(2000);
    expect(result.status).toBe("other_leader");
    if (result.status === "other_leader") {
      expect(result.leader).toBe("broker-1:8080");
    }
  });

  test("elects when existing broker is stale", async () => {
    const backend = new MemoryBackend();
    const state = registerBroker(emptyState(), "broker-1:8080", 1000);
    await backend.createIfNotExists(
      QUEUE_STATE_KEY,
      encoder.encode(JSON.stringify(state)),
    );

    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-2:8080",
      heartbeatTimeoutMs: 5000,
    });

    // 10s later, well past 5s timeout
    const result = await election.tryElect(11_000);
    expect(result.status).toBe("elected");

    const newState = await readState(backend);
    expect(newState.broker).toBe("broker-2:8080");
  });

  test("handles CAS conflict during election", async () => {
    const backend = new MemoryBackend();
    // Set up stale broker
    const state = registerBroker(emptyState(), "broker-1:8080", 1000);
    const version = await backend.createIfNotExists(
      QUEUE_STATE_KEY,
      encoder.encode(JSON.stringify(state)),
    );

    // Two candidates try to take over simultaneously
    const election2 = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-2:8080",
      heartbeatTimeoutMs: 5000,
    });
    const election3 = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-3:8080",
      heartbeatTimeoutMs: 5000,
    });

    const now = 11_000;
    const results = await Promise.all([
      election2.tryElect(now),
      election3.tryElect(now),
    ]);

    const elected = results.filter((r) => r.status === "elected");
    const conflicts = results.filter((r) => r.status === "conflict");
    // Exactly one should win, one should conflict
    expect(elected.length).toBe(1);
    expect(conflicts.length).toBe(1);
  });

  test("checkLeadership returns true for current broker", async () => {
    const backend = new MemoryBackend();
    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-1:8080",
    });
    await election.tryElect(1000);

    expect(await election.checkLeadership()).toBe(true);
  });

  test("checkLeadership returns false after takeover", async () => {
    const backend = new MemoryBackend();
    const election1 = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-1:8080",
      heartbeatTimeoutMs: 5000,
    });
    await election1.tryElect(1000);

    const election2 = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-2:8080",
      heartbeatTimeoutMs: 5000,
    });
    // Take over after stale timeout
    await election2.tryElect(11_000);

    expect(await election1.checkLeadership()).toBe(false);
    expect(await election2.checkLeadership()).toBe(true);
  });

  test("re-registers when own heartbeat is stale", async () => {
    const backend = new MemoryBackend();
    const state = registerBroker(emptyState(), "broker-1:8080", 1000);
    await backend.createIfNotExists(
      QUEUE_STATE_KEY,
      encoder.encode(JSON.stringify(state)),
    );

    const election = new BrokerElection({
      storage: backend,
      brokerAddress: "broker-1:8080",
      heartbeatTimeoutMs: 5000,
    });

    // Our own heartbeat is stale — should re-register
    const result = await election.tryElect(11_000);
    expect(result.status).toBe("elected");

    const newState = await readState(backend);
    expect(newState.brokerHeartbeat).toBe(11_000);
  });
});
