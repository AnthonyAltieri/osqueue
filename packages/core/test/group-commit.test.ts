import { describe, test, expect, afterEach } from "vitest";
import { GroupCommitEngine } from "../src/group-commit.js";
import { MemoryBackend } from "@osqueue/storage";
import { QUEUE_STATE_KEY } from "@osqueue/types";
import type { QueueState } from "@osqueue/types";

const decoder = new TextDecoder();

function readState(backend: MemoryBackend): Promise<QueueState> {
  return backend.read(QUEUE_STATE_KEY).then((r) => {
    if (!r) throw new Error("State not found");
    return JSON.parse(decoder.decode(r.data));
  });
}

describe("GroupCommitEngine", () => {
  let engine: GroupCommitEngine;

  afterEach(() => {
    engine?.stop();
  });

  test("initializes state on start", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    const state = await readState(backend);
    expect(state.broker).toBeNull();
    expect(state.jobs).toEqual([]);
  });

  test("enqueue and claim a job", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    const enqResult = await engine.submit({
      type: "enqueue",
      jobs: [{ payload: { task: "hello" } }],
    });
    expect(enqResult.enqueuedIds).toHaveLength(1);

    const claimResult = await engine.submit({
      type: "claim",
      workerId: "w1",
    });
    expect(claimResult.claimedJob).not.toBeNull();
    expect(claimResult.claimedJob!.payload).toEqual({ task: "hello" });
  });

  test("complete removes job from state", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    await engine.submit({
      type: "enqueue",
      jobs: [{ payload: "x" }],
    });

    const claimResult = await engine.submit({
      type: "claim",
      workerId: "w1",
    });

    await engine.submit({
      type: "complete",
      jobId: claimResult.claimedJob!.id,
      workerId: "w1",
    });

    const state = await readState(backend);
    expect(state.jobs).toHaveLength(0);
  });

  test("batches concurrent mutations", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    // Submit multiple enqueues concurrently
    const results = await Promise.all([
      engine.submit({ type: "enqueue", jobs: [{ payload: "a" }] }),
      engine.submit({ type: "enqueue", jobs: [{ payload: "b" }] }),
      engine.submit({ type: "enqueue", jobs: [{ payload: "c" }] }),
    ]);

    expect(results[0]!.enqueuedIds).toHaveLength(1);
    expect(results[1]!.enqueuedIds).toHaveLength(1);
    expect(results[2]!.enqueuedIds).toHaveLength(1);

    const state = await readState(backend);
    expect(state.jobs).toHaveLength(3);
  });

  test("recovers from CAS conflict", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
      conflictBackoffMs: 10,
    });
    await engine.start();

    // Enqueue a job through the engine
    await engine.submit({
      type: "enqueue",
      jobs: [{ payload: "initial" }],
    });

    // Externally modify the state to cause a CAS conflict
    const current = await backend.read(QUEUE_STATE_KEY);
    const state = JSON.parse(decoder.decode(current!.data)) as QueueState;
    state.jobs.push({
      id: "external-job",
      status: "unclaimed",
      payload: "external",
      createdAt: Date.now(),
      attempts: 0,
    });
    await backend.write(
      QUEUE_STATE_KEY,
      new TextEncoder().encode(JSON.stringify(state)),
      current!.version,
    );

    // The engine's cache is now stale — next submit should recover
    const result = await engine.submit({
      type: "enqueue",
      jobs: [{ payload: "after-conflict" }],
    });
    expect(result.enqueuedIds).toHaveLength(1);

    // Verify all 3 jobs exist
    const finalState = await readState(backend);
    expect(finalState.jobs).toHaveLength(3);
  });

  test("stop rejects pending mutations", async () => {
    const backend = new MemoryBackend({ latencyMs: 200 });
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();
    backend.setOptions({ latencyMs: 0 });

    const promise = engine.submit({
      type: "enqueue",
      jobs: [{ payload: "will-be-rejected" }],
    });
    engine.stop();

    await expect(promise).rejects.toThrow("GroupCommitEngine stopped");
  });

  test("getCachedState returns current state", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    await engine.submit({
      type: "enqueue",
      jobs: [{ payload: "test" }],
    });

    const cached = engine.getCachedState();
    expect(cached).not.toBeNull();
    expect(cached!.jobs).toHaveLength(1);
  });

  test("registers broker on mutation", async () => {
    const backend = new MemoryBackend();
    engine = new GroupCommitEngine({
      storage: backend,
      intervalMs: 10,
    });
    await engine.start();

    await engine.submit({
      type: "register_broker",
      brokerAddress: "localhost:8080",
      timestamp: 5000,
    });

    const state = await readState(backend);
    expect(state.broker).toBe("localhost:8080");
    expect(state.brokerHeartbeat).toBe(5000);
  });
});
