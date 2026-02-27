import type { ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
  QueueService,
  SubmitJobResponseSchema,
  ClaimJobResponseSchema,
  HeartbeatResponseSchema,
  CompleteJobResponseSchema,
  GetStatsResponseSchema,
  ListJobsResponseSchema,
  JobInfoSchema,
} from "@osqueue/proto";
import type { GroupCommitEngine } from "@osqueue/core";
import type { JobId, WorkerId } from "@osqueue/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createQueueServiceImpl(
  engine: GroupCommitEngine,
): ServiceImpl<typeof QueueService> {
  return {
    async submitJob(req) {
      const payload = JSON.parse(decoder.decode(req.payload));
      const result = await engine.submit({
        type: "enqueue",
        jobs: [
          {
            payload,
            jobType: req.type || undefined,
            maxAttempts: req.maxAttempts ?? undefined,
          },
        ],
      });
      const response = create(SubmitJobResponseSchema);
      response.jobId = result.enqueuedIds![0]!;
      return response;
    },

    async claimJob(req) {
      const result = await engine.submit({
        type: "claim",
        workerId: req.workerId as WorkerId,
        jobTypes: req.types.length > 0 ? req.types : undefined,
      });
      const response = create(ClaimJobResponseSchema);
      if (result.claimedJob) {
        response.jobId = result.claimedJob.id;
        response.payload = encoder.encode(
          JSON.stringify(result.claimedJob.payload),
        );
        response.type = result.claimedJob.type ?? "";
      }
      return response;
    },

    async heartbeat(req) {
      await engine.submit({
        type: "heartbeat",
        jobId: req.jobId as JobId,
        workerId: req.workerId as WorkerId,
      });
      return create(HeartbeatResponseSchema);
    },

    async completeJob(req) {
      await engine.submit({
        type: "complete",
        jobId: req.jobId as JobId,
        workerId: req.workerId as WorkerId,
      });
      return create(CompleteJobResponseSchema);
    },

    async getStats() {
      const state = engine.getCachedState();
      const response = create(GetStatsResponseSchema);
      if (state) {
        response.total = state.jobs.length;
        response.unclaimed = state.jobs.filter(
          (j) => j.status === "unclaimed",
        ).length;
        response.inProgress = state.jobs.filter(
          (j) => j.status === "in_progress",
        ).length;
        response.brokerAddress = state.broker ?? "";
      }
      return response;
    },

    async listJobs() {
      const state = engine.getCachedState();
      const response = create(ListJobsResponseSchema);
      if (state) {
        response.jobs = state.jobs.map((j) => {
          const info = create(JobInfoSchema);
          info.id = j.id;
          info.status = j.status;
          info.payload = encoder.encode(JSON.stringify(j.payload));
          info.type = j.type ?? "";
          info.workerId = j.workerId ?? "";
          info.createdAt = BigInt(j.createdAt);
          info.attempts = j.attempts;
          info.maxAttempts = j.maxAttempts ?? 0;
          info.heartbeat = BigInt(j.heartbeat ?? 0);
          return info;
        });
        response.total = state.jobs.length;
        response.unclaimed = state.jobs.filter(
          (j) => j.status === "unclaimed",
        ).length;
        response.inProgress = state.jobs.filter(
          (j) => j.status === "in_progress",
        ).length;
        response.completedTotal = state.completedTotal ?? 0;
        response.brokerAddress = state.broker ?? "";
      }
      return response;
    },
  };
}
