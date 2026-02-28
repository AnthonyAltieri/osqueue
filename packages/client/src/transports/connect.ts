import { create } from "@bufbuild/protobuf";
import { createClient, type Client } from "@connectrpc/connect";
import {
  TransportConfigError,
  TransportConnectionError,
  TransportRequestError,
  wrapUnknownError,
} from "@osqueue/types";
import {
  QueueService,
  SubmitJobRequestSchema,
  ClaimJobRequestSchema,
  HeartbeatRequestSchema,
  CompleteJobRequestSchema,
  GetStatsRequestSchema,
  ListJobsRequestSchema,
} from "@osqueue/proto";
import type { QueueTransportAdapter, ConnectTransportConfig } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function createNodeTransport(baseUrl: string, httpVersion: "1.1" | "2") {
  const { createConnectTransport: makeTransport } = await import("@connectrpc/connect-node");
  return makeTransport({ baseUrl, httpVersion });
}

export function createConnectTransport(config: ConnectTransportConfig): QueueTransportAdapter {
  if (!config.baseUrl && !config.transport) {
    throw new TransportConfigError(
      "Connect transport requires baseUrl when no transport is provided",
    );
  }

  let clientPromise: Promise<Client<typeof QueueService>> | null = null;

  const getClient = async (): Promise<Client<typeof QueueService>> => {
    if (!clientPromise) {
      clientPromise = (async () => {
        try {
          const transport =
            config.transport ??
            (await createNodeTransport(
              config.baseUrl!,
              config.httpVersion ?? "1.1",
            ));
          return createClient(QueueService, transport);
        } catch (error) {
          throw wrapUnknownError(
            error,
            (message, cause) =>
              new TransportConnectionError(message, { cause }),
          );
        }
      })();
    }
    return await clientPromise;
  };

  return {
    async submitJob(req) {
      const client = await getClient();
      const request = create(SubmitJobRequestSchema);
      request.payload = encoder.encode(JSON.stringify(req.payload));
      request.type = req.type;
      if (req.maxAttempts !== undefined) {
        request.maxAttempts = req.maxAttempts;
      }
      let response;
      try {
        response = await client.submitJob(request);
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "SubmitJob",
            }),
        );
      }
      return { jobId: response.jobId };
    },

    async claimJob(req) {
      const client = await getClient();
      const request = create(ClaimJobRequestSchema);
      request.workerId = req.workerId;
      if (req.types && req.types.length > 0) {
        request.types = req.types;
      }
      let response;
      try {
        response = await client.claimJob(request);
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "ClaimJob",
            }),
        );
      }
      return {
        jobId: response.jobId,
        type: response.type,
        payload: response.payload ? JSON.parse(decoder.decode(response.payload)) : null,
      };
    },

    async heartbeat(req) {
      const client = await getClient();
      const request = create(HeartbeatRequestSchema);
      request.jobId = req.jobId;
      request.workerId = req.workerId;
      try {
        await client.heartbeat(request);
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "Heartbeat",
            }),
        );
      }
    },

    async completeJob(req) {
      const client = await getClient();
      const request = create(CompleteJobRequestSchema);
      request.jobId = req.jobId;
      request.workerId = req.workerId;
      try {
        await client.completeJob(request);
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "CompleteJob",
            }),
        );
      }
    },

    async getStats() {
      const client = await getClient();
      try {
        return await client.getStats(create(GetStatsRequestSchema));
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "GetStats",
            }),
        );
      }
    },

    async listJobs() {
      const client = await getClient();
      try {
        return await client.listJobs(create(ListJobsRequestSchema));
      } catch (error) {
        throw wrapUnknownError(
          error,
          (message, cause) =>
            new TransportRequestError(message, {
              cause,
              method: "ListJobs",
            }),
        );
      }
    },

    async reconnect() {
      clientPromise = null;
      await getClient();
    },

    async close() {
      clientPromise = null;
    },
  };
}
