import type { ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
  QueueService,
  SubmitJobResponseSchema,
  ClaimJobResponseSchema,
  HeartbeatResponseSchema,
  CompleteJobResponseSchema,
  GetStatsResponseSchema,
} from "@osqueue/proto";
import type { GroupCommitEngine } from "@osqueue/core";

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
        workerId: req.workerId,
      });
      const response = create(ClaimJobResponseSchema);
      if (result.claimedJob) {
        response.jobId = result.claimedJob.id;
        response.payload = encoder.encode(
          JSON.stringify(result.claimedJob.payload),
        );
      }
      return response;
    },

    async heartbeat(req) {
      await engine.submit({
        type: "heartbeat",
        jobId: req.jobId,
        workerId: req.workerId,
      });
      return create(HeartbeatResponseSchema);
    },

    async completeJob(req) {
      await engine.submit({
        type: "complete",
        jobId: req.jobId,
        workerId: req.workerId,
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
  };
}
