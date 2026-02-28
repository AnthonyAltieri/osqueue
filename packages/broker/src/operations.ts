import type { GroupCommitEngine } from "@osqueue/core";
import type { JobId, WorkerId, QueueState } from "@osqueue/types";
import {
  createTracer,
  withSpan,
  OSQUEUE_JOB_ID,
  OSQUEUE_JOB_TYPE,
  OSQUEUE_WORKER_ID,
  OSQUEUE_JOBS_CLAIMED,
} from "@osqueue/otel";

const tracer = createTracer("@osqueue/broker");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface QueueStatsSnapshot {
  total: number;
  unclaimed: number;
  inProgress: number;
  completedTotal: number;
  brokerAddress: string;
}

export interface QueueJobSnapshot {
  id: string;
  status: string;
  payload: unknown;
  type?: string;
  workerId?: string;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  heartbeat: number;
}

export function getQueueStats(state: QueueState | null): QueueStatsSnapshot {
  if (!state) {
    return {
      total: 0,
      unclaimed: 0,
      inProgress: 0,
      completedTotal: 0,
      brokerAddress: "",
    };
  }

  return {
    total: state.jobs.length,
    unclaimed: state.jobs.filter((j) => j.status === "unclaimed").length,
    inProgress: state.jobs.filter((j) => j.status === "in_progress").length,
    completedTotal: state.completedTotal ?? 0,
    brokerAddress: state.broker ?? "",
  };
}

export function getQueueSnapshot(engine: GroupCommitEngine): {
  jobs: QueueJobSnapshot[];
  stats: QueueStatsSnapshot;
} {
  const state = engine.getCachedState();
  const stats = getQueueStats(state);

  if (!state) {
    return { jobs: [], stats };
  }

  return {
    stats,
    jobs: state.jobs.map((job) => ({
      id: job.id,
      status: job.status,
      payload: job.payload,
      type: job.type,
      workerId: job.workerId,
      createdAt: job.createdAt,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts ?? 0,
      heartbeat: job.heartbeat ?? 0,
    })),
  };
}

export async function submitJobOperation(
  engine: GroupCommitEngine,
  input: {
    payload: unknown;
    type?: string;
    maxAttempts?: number;
  },
): Promise<{ jobId: string }> {
  return withSpan(tracer, "broker.submitJob", {
    [OSQUEUE_JOB_TYPE]: input.type,
  }, async (span) => {
    const result = await engine.submit({
      type: "enqueue",
      jobs: [
        {
          payload: input.payload,
          jobType: input.type || undefined,
          maxAttempts: input.maxAttempts ?? undefined,
        },
      ],
    });

    const jobId = result.enqueuedIds![0]!;
    span.setAttribute(OSQUEUE_JOB_ID, jobId);
    return { jobId };
  });
}

export async function claimJobOperation(
  engine: GroupCommitEngine,
  input: {
    workerId: string;
    types?: string[];
  },
): Promise<{ jobId?: string; payload?: unknown; type?: string }> {
  return withSpan(tracer, "broker.claimJob", {
    [OSQUEUE_WORKER_ID]: input.workerId,
  }, async (span) => {
    const result = await engine.submit({
      type: "claim",
      workerId: input.workerId as WorkerId,
      jobTypes: input.types && input.types.length > 0 ? input.types : undefined,
    });

    if (!result.claimedJob) {
      span.setAttribute(OSQUEUE_JOBS_CLAIMED, 0);
      return {};
    }

    span.setAttribute(OSQUEUE_JOB_ID, result.claimedJob.id);
    span.setAttribute(OSQUEUE_JOBS_CLAIMED, 1);
    if (result.claimedJob.type) {
      span.setAttribute(OSQUEUE_JOB_TYPE, result.claimedJob.type);
    }
    return {
      jobId: result.claimedJob.id,
      payload: result.claimedJob.payload,
      type: result.claimedJob.type,
    };
  });
}

export async function heartbeatOperation(
  engine: GroupCommitEngine,
  input: { jobId: string; workerId: string },
): Promise<void> {
  return withSpan(tracer, "broker.heartbeat", {
    [OSQUEUE_JOB_ID]: input.jobId,
    [OSQUEUE_WORKER_ID]: input.workerId,
  }, async () => {
    await engine.submit({
      type: "heartbeat",
      jobId: input.jobId as JobId,
      workerId: input.workerId as WorkerId,
    });
  });
}

export async function completeJobOperation(
  engine: GroupCommitEngine,
  input: { jobId: string; workerId: string },
): Promise<void> {
  return withSpan(tracer, "broker.completeJob", {
    [OSQUEUE_JOB_ID]: input.jobId,
    [OSQUEUE_WORKER_ID]: input.workerId,
  }, async () => {
    await engine.submit({
      type: "complete",
      jobId: input.jobId as JobId,
      workerId: input.workerId as WorkerId,
    });
  });
}

export function encodePayload(payload: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(payload));
}

export function decodePayload(payload: Uint8Array): unknown {
  return JSON.parse(decoder.decode(payload));
}
