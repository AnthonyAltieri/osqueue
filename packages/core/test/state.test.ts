import { describe, test, expect } from "bun:test";
import {
  emptyState,
  enqueueJobs,
  claimJob,
  heartbeatJob,
  completeJob,
  expireHeartbeats,
  registerBroker,
  applyMutation,
} from "../src/state.js";
import type { QueueState } from "@osqueue/types";

describe("state transitions", () => {
  test("emptyState creates valid initial state", () => {
    const state = emptyState();
    expect(state.broker).toBeNull();
    expect(state.brokerHeartbeat).toBe(0);
    expect(state.jobs).toEqual([]);
  });

  describe("enqueueJobs", () => {
    test("adds jobs to empty state", () => {
      const { state, ids } = enqueueJobs(emptyState(), [
        { payload: { task: "a" } },
        { payload: { task: "b" } },
      ], 1000);
      expect(ids).toHaveLength(2);
      expect(state.jobs).toHaveLength(2);
      expect(state.jobs[0]!.status).toBe("unclaimed");
      expect(state.jobs[0]!.payload).toEqual({ task: "a" });
      expect(state.jobs[0]!.createdAt).toBe(1000);
      expect(state.jobs[0]!.attempts).toBe(0);
    });

    test("appends to existing jobs (FIFO)", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "first" }], 1000);
      const { state: s2 } = enqueueJobs(s1, [{ payload: "second" }], 2000);
      expect(s2.jobs).toHaveLength(2);
      expect(s2.jobs[0]!.payload).toBe("first");
      expect(s2.jobs[1]!.payload).toBe("second");
    });

    test("respects maxAttempts", () => {
      const { state } = enqueueJobs(emptyState(), [
        { payload: "x", maxAttempts: 5 },
      ]);
      expect(state.jobs[0]!.maxAttempts).toBe(5);
    });
  });

  describe("claimJob", () => {
    test("claims first unclaimed job", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [
        { payload: "a" },
        { payload: "b" },
      ], 1000);
      const { state: s2, claimed } = claimJob(s1, "worker-1", 2000);
      expect(claimed).not.toBeNull();
      expect(claimed!.payload).toBe("a");
      expect(s2.jobs[0]!.status).toBe("in_progress");
      expect(s2.jobs[0]!.workerId).toBe("worker-1");
      expect(s2.jobs[0]!.heartbeat).toBe(2000);
      expect(s2.jobs[0]!.attempts).toBe(1);
      // second job still unclaimed
      expect(s2.jobs[1]!.status).toBe("unclaimed");
    });

    test("returns null when no unclaimed jobs", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      const { claimed } = claimJob(s2, "worker-2", 3000);
      expect(claimed).toBeNull();
    });

    test("skips in_progress jobs", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [
        { payload: "a" },
        { payload: "b" },
      ], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      const { claimed } = claimJob(s2, "worker-2", 3000);
      expect(claimed!.payload).toBe("b");
    });
  });

  describe("heartbeatJob", () => {
    test("updates heartbeat timestamp", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2, claimed } = claimJob(s1, "worker-1", 2000);
      const s3 = heartbeatJob(s2, claimed!.id, "worker-1", 5000);
      expect(s3.jobs[0]!.heartbeat).toBe(5000);
    });

    test("no-op for wrong worker", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2, claimed } = claimJob(s1, "worker-1", 2000);
      const s3 = heartbeatJob(s2, claimed!.id, "worker-wrong", 5000);
      expect(s3.jobs[0]!.heartbeat).toBe(2000); // unchanged
    });

    test("no-op for unclaimed job", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const s2 = heartbeatJob(s1, s1.jobs[0]!.id, "worker-1", 5000);
      expect(s2.jobs[0]!.heartbeat).toBeUndefined();
    });
  });

  describe("completeJob", () => {
    test("removes completed job from array", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [
        { payload: "a" },
        { payload: "b" },
      ], 1000);
      const { state: s2, claimed } = claimJob(s1, "worker-1", 2000);
      const s3 = completeJob(s2, claimed!.id, "worker-1");
      expect(s3.jobs).toHaveLength(1);
      expect(s3.jobs[0]!.payload).toBe("b");
    });

    test("no-op for wrong worker", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2, claimed } = claimJob(s1, "worker-1", 2000);
      const s3 = completeJob(s2, claimed!.id, "wrong-worker");
      expect(s3.jobs).toHaveLength(1);
    });

    test("no-op for unclaimed job", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const s2 = completeJob(s1, s1.jobs[0]!.id, "worker-1");
      expect(s2.jobs).toHaveLength(1);
    });
  });

  describe("expireHeartbeats", () => {
    test("resets expired in_progress jobs to unclaimed", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      // 35s later, with default 30s timeout
      const s3 = expireHeartbeats(s2, 37_000, 30_000);
      expect(s3.jobs[0]!.status).toBe("unclaimed");
      expect(s3.jobs[0]!.workerId).toBeUndefined();
      expect(s3.jobs[0]!.heartbeat).toBeUndefined();
    });

    test("does not expire jobs within timeout", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      const s3 = expireHeartbeats(s2, 20_000, 30_000);
      expect(s3.jobs[0]!.status).toBe("in_progress");
    });

    test("drops jobs that exceed maxAttempts", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [
        { payload: "a", maxAttempts: 1 },
      ], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      // Job has attempts=1, maxAttempts=1 → should be dropped
      const s3 = expireHeartbeats(s2, 37_000, 30_000);
      expect(s3.jobs).toHaveLength(0);
    });

    test("retries jobs under maxAttempts", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [
        { payload: "a", maxAttempts: 3 },
      ], 1000);
      const { state: s2 } = claimJob(s1, "worker-1", 2000);
      // attempts=1, maxAttempts=3 → should reset
      const s3 = expireHeartbeats(s2, 37_000, 30_000);
      expect(s3.jobs[0]!.status).toBe("unclaimed");
      expect(s3.jobs[0]!.attempts).toBe(1); // attempts preserved for next claim
    });
  });

  describe("registerBroker", () => {
    test("sets broker address and heartbeat", () => {
      const state = registerBroker(emptyState(), "broker:8080", 5000);
      expect(state.broker).toBe("broker:8080");
      expect(state.brokerHeartbeat).toBe(5000);
    });

    test("preserves jobs", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "a" }], 1000);
      const s2 = registerBroker(s1, "broker:8080", 5000);
      expect(s2.jobs).toHaveLength(1);
    });
  });

  describe("applyMutation", () => {
    test("enqueue mutation returns ids", () => {
      const { state, result } = applyMutation(emptyState(), {
        type: "enqueue",
        jobs: [{ payload: "x" }],
      }, 1000);
      expect(result.enqueuedIds).toHaveLength(1);
      expect(state.jobs).toHaveLength(1);
    });

    test("claim mutation returns claimed job", () => {
      const { state: s1 } = enqueueJobs(emptyState(), [{ payload: "x" }], 1000);
      const { result } = applyMutation(s1, {
        type: "claim",
        workerId: "w1",
      }, 2000);
      expect(result.claimedJob).not.toBeNull();
      expect(result.claimedJob!.payload).toBe("x");
    });

    test("claim mutation returns null when empty", () => {
      const { result } = applyMutation(emptyState(), {
        type: "claim",
        workerId: "w1",
      });
      expect(result.claimedJob).toBeNull();
    });
  });
});
