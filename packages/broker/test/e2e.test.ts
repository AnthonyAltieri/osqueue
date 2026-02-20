import { describe, test, expect, afterEach } from "bun:test";
import { BrokerServer } from "../src/server.js";
import { OsqueueClient, Worker } from "@osqueue/client";
import { MemoryBackend } from "@osqueue/storage";

describe("end-to-end", () => {
  let broker: BrokerServer;

  afterEach(async () => {
    await broker?.stop();
  });

  test("submit, claim, complete a job through broker", async () => {
    const storage = new MemoryBackend();
    broker = new BrokerServer({
      storage,
      host: "127.0.0.1",
      port: 9876,
      groupCommitIntervalMs: 10,
      heartbeatIntervalMs: 60_000, // long so it doesn't interfere
    });
    await broker.start();

    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9876",
    });

    // Submit a job
    const jobId = await client.submitJob({ task: "test-job" });
    expect(jobId).toBeTruthy();

    // Check stats
    const stats = await client.getStats();
    expect(stats.total).toBe(1);
    expect(stats.unclaimed).toBe(1);

    // Claim the job
    const claimed = await client.claimJob("worker-1");
    expect(claimed).not.toBeNull();
    expect(claimed!.jobId).toBe(jobId);
    expect(claimed!.payload).toEqual({ task: "test-job" });

    // Heartbeat
    await client.heartbeat(jobId, "worker-1");

    // Complete
    await client.completeJob(jobId, "worker-1");

    // Stats should be empty now
    const stats2 = await client.getStats();
    expect(stats2.total).toBe(0);
  });

  test("claim returns null when no jobs", async () => {
    const storage = new MemoryBackend();
    broker = new BrokerServer({
      storage,
      host: "127.0.0.1",
      port: 9877,
      groupCommitIntervalMs: 10,
      heartbeatIntervalMs: 60_000,
    });
    await broker.start();

    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9877",
    });

    const claimed = await client.claimJob("worker-1");
    expect(claimed).toBeNull();
  });

  test("Worker processes jobs automatically", async () => {
    const storage = new MemoryBackend();
    broker = new BrokerServer({
      storage,
      host: "127.0.0.1",
      port: 9878,
      groupCommitIntervalMs: 10,
      heartbeatIntervalMs: 60_000,
    });
    await broker.start();

    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9878",
    });

    // Submit jobs
    await client.submitJob({ n: 1 });
    await client.submitJob({ n: 2 });

    // Track processed jobs
    const processed: unknown[] = [];

    const worker = new Worker({
      client,
      handler: async (payload) => {
        processed.push(payload);
      },
      pollIntervalMs: 100,
      heartbeatIntervalMs: 5000,
    });

    worker.start();

    // Wait for jobs to be processed
    await new Promise((r) => setTimeout(r, 1500));

    await worker.stop();

    expect(processed).toHaveLength(2);
    expect(processed).toContainEqual({ n: 1 });
    expect(processed).toContainEqual({ n: 2 });

    // All jobs should be removed
    const stats = await client.getStats();
    expect(stats.total).toBe(0);
  });
});
