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
import {
  claimJobOperation,
  completeJobOperation,
  decodePayload,
  encodePayload,
  getQueueSnapshot,
  getQueueStats,
  heartbeatOperation,
  submitJobOperation,
} from "./operations.js";

export function createQueueServiceImpl(
  engine: GroupCommitEngine,
): ServiceImpl<typeof QueueService> {
  return {
    async submitJob(req) {
      const payload = decodePayload(req.payload);
      const result = await submitJobOperation(engine, {
        payload,
        type: req.type || undefined,
        maxAttempts: req.maxAttempts ?? undefined,
      });

      const response = create(SubmitJobResponseSchema);
      response.jobId = result.jobId;
      return response;
    },

    async claimJob(req) {
      const result = await claimJobOperation(engine, {
        workerId: req.workerId,
        types: req.types,
      });

      const response = create(ClaimJobResponseSchema);
      if (result.jobId) {
        response.jobId = result.jobId;
        response.payload = encodePayload(result.payload ?? null);
        response.type = result.type ?? "";
      }
      return response;
    },

    async heartbeat(req) {
      await heartbeatOperation(engine, {
        jobId: req.jobId,
        workerId: req.workerId,
      });
      return create(HeartbeatResponseSchema);
    },

    async completeJob(req) {
      await completeJobOperation(engine, {
        jobId: req.jobId,
        workerId: req.workerId,
      });
      return create(CompleteJobResponseSchema);
    },

    async getStats() {
      const stats = getQueueStats(engine.getCachedState());
      const response = create(GetStatsResponseSchema);
      response.total = stats.total;
      response.unclaimed = stats.unclaimed;
      response.inProgress = stats.inProgress;
      response.brokerAddress = stats.brokerAddress;
      return response;
    },

    async listJobs() {
      const snapshot = getQueueSnapshot(engine);
      const response = create(ListJobsResponseSchema);

      response.jobs = snapshot.jobs.map((job) => {
        const info = create(JobInfoSchema);
        info.id = job.id;
        info.status = job.status;
        info.payload = encodePayload(job.payload);
        info.type = job.type ?? "";
        info.workerId = job.workerId ?? "";
        info.createdAt = BigInt(job.createdAt);
        info.attempts = job.attempts;
        info.maxAttempts = job.maxAttempts;
        info.heartbeat = BigInt(job.heartbeat);
        return info;
      });

      response.total = snapshot.stats.total;
      response.unclaimed = snapshot.stats.unclaimed;
      response.inProgress = snapshot.stats.inProgress;
      response.completedTotal = snapshot.stats.completedTotal;
      response.brokerAddress = snapshot.stats.brokerAddress;
      return response;
    },
  };
}
