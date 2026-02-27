import { describe, test, expect, afterEach } from "bun:test";
import { z } from "zod";
import { BrokerServer } from "../src/server.js";
import { OsqueueClient, Worker } from "@osqueue/client";
import type { WorkerId } from "@osqueue/types";
import { MemoryBackend } from "@osqueue/storage";

const wid = (s: string) => s as WorkerId;

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

    const registry = { test: z.object({ task: z.string() }) };
    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9876",
    }, registry);

    // Submit a job
    const jobId = await client.submitJob("test", { task: "test-job" });
    expect(jobId).toBeTruthy();

    // Check stats
    const stats = await client.getStats();
    expect(stats.total).toBe(1);
    expect(stats.unclaimed).toBe(1);

    // Claim the job
    const claimed = await client.claimJob(wid("worker-1"));
    expect(claimed).not.toBeNull();
    expect(claimed!.jobId).toBe(jobId);
    expect(claimed!.payload).toEqual({ task: "test-job" });
    expect(claimed!.type).toBe("test");

    // Heartbeat
    await client.heartbeat(jobId, wid("worker-1"));

    // Complete
    await client.completeJob(jobId, wid("worker-1"));

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

    const claimed = await client.claimJob(wid("worker-1"));
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

    const registry = {
      task: z.object({ n: z.number() }),
    };

    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9878",
    }, registry);

    // Submit jobs
    await client.submitJob("task", { n: 1 });
    await client.submitJob("task", { n: 2 });

    // Track processed jobs
    const processed: unknown[] = [];

    const worker = new Worker({
      client,
      handlers: {
        task: async (payload) => {
          processed.push(payload);
        },
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

  test("typed worker dispatches to per-type handlers", async () => {
    const storage = new MemoryBackend();
    broker = new BrokerServer({
      storage,
      host: "127.0.0.1",
      port: 9879,
      groupCommitIntervalMs: 10,
      heartbeatIntervalMs: 60_000,
    });
    await broker.start();

    const registry = {
      email: z.object({ to: z.string() }),
      sms: z.object({ phone: z.string() }),
    };

    const client = new OsqueueClient({
      brokerUrl: "http://127.0.0.1:9879",
    }, registry);

    // Submit different job types
    await client.submitJob("email", { to: "user@example.com" });
    await client.submitJob("sms", { phone: "555-1234" });

    const emails: Array<{ to: string }> = [];
    const texts: Array<{ phone: string }> = [];

    const worker = new Worker({
      client,
      handlers: {
        email: async (payload) => {
          emails.push(payload);
        },
        sms: async (payload) => {
          texts.push(payload);
        },
      },
      pollIntervalMs: 100,
      heartbeatIntervalMs: 5000,
    });

    worker.start();

    await new Promise((r) => setTimeout(r, 1500));

    await worker.stop();

    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("user@example.com");
    expect(texts).toHaveLength(1);
    expect(texts[0]!.phone).toBe("555-1234");
  });
});
