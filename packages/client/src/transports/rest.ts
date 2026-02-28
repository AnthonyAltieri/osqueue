import { create } from "@bufbuild/protobuf";
import {
  TransportConfigError,
  TransportRequestError,
} from "@osqueue/types";
import {
  GetStatsResponseSchema,
  JobInfoSchema,
  ListJobsResponseSchema,
} from "@osqueue/proto";
import type { QueueTransportAdapter, RestTransportConfig } from "./types.js";

type JsonRecord = Record<string, unknown>;
const encoder = new TextEncoder();

function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function createRestTransport(config: RestTransportConfig): QueueTransportAdapter {
  if (!config.baseUrl) {
    throw new TransportConfigError("REST transport requires baseUrl");
  }
  const baseUrl = trimTrailingSlash(config.baseUrl);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new TransportConfigError(
      "REST transport requires fetch support in this runtime",
    );
  }

  const request = async <T>(method: string, path: string, body?: JsonRecord): Promise<T> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let remoteTag: string | undefined;
      let message = text;
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            _tag?: string;
            message?: string;
          };
          remoteTag = parsed._tag;
          if (parsed.message) {
            message = parsed.message;
          }
        } catch {
          // Keep raw text message.
        }
      }
      throw new TransportRequestError(
        `REST ${method} ${path} failed: ${response.status} ${message}`,
        {
          method,
          path,
          status: response.status,
          remoteTag,
        },
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  return {
    async submitJob(req) {
      return await request<{ jobId: string }>("POST", "/v1/jobs", {
        payload: req.payload,
        type: req.type,
        maxAttempts: req.maxAttempts,
      });
    },

    async claimJob(req) {
      const result = await request<{
        jobId?: string;
        type?: string;
        payload?: unknown;
      }>("POST", "/v1/jobs/claim", {
        workerId: req.workerId,
        types: req.types,
      });

      return {
        jobId: result.jobId,
        type: result.type ?? "",
        payload: result.payload ?? null,
      };
    },

    async heartbeat(req) {
      await request<void>("POST", `/v1/jobs/${req.jobId}/heartbeat`, {
        workerId: req.workerId,
      });
    },

    async completeJob(req) {
      await request<void>("POST", `/v1/jobs/${req.jobId}/complete`, {
        workerId: req.workerId,
      });
    },

    async getStats() {
      const json = await request<{
        total: number;
        unclaimed: number;
        inProgress: number;
        brokerAddress: string;
      }>("GET", "/v1/stats");

      const response = create(GetStatsResponseSchema);
      response.total = json.total;
      response.unclaimed = json.unclaimed;
      response.inProgress = json.inProgress;
      response.brokerAddress = json.brokerAddress;
      return response;
    },

    async listJobs() {
      const json = await request<{
        jobs: Array<{
          id: string;
          status: string;
          payload: unknown;
          type?: string;
          workerId?: string;
          createdAt: number;
          attempts: number;
          maxAttempts: number;
          heartbeat: number;
        }>;
        total: number;
        unclaimed: number;
        inProgress: number;
        completedTotal: number;
        brokerAddress: string;
      }>("GET", "/v1/jobs");

      const response = create(ListJobsResponseSchema);
      response.jobs = json.jobs.map((job) => {
        const info = create(JobInfoSchema);
        info.id = job.id;
        info.status = job.status;
        info.payload = encoder.encode(JSON.stringify(job.payload));
        info.type = job.type ?? "";
        info.workerId = job.workerId ?? "";
        info.createdAt = BigInt(job.createdAt);
        info.attempts = job.attempts;
        info.maxAttempts = job.maxAttempts;
        info.heartbeat = BigInt(job.heartbeat);
        return info;
      });
      response.total = json.total;
      response.unclaimed = json.unclaimed;
      response.inProgress = json.inProgress;
      response.completedTotal = json.completedTotal;
      response.brokerAddress = json.brokerAddress;
      return response;
    },
  };
}
