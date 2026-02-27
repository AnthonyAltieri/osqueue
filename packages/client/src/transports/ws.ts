import { create } from "@bufbuild/protobuf";
import {
  TransportConfigError,
  TransportConnectionError,
  TransportRequestError,
} from "@osqueue/types";
import {
  GetStatsResponseSchema,
  JobInfoSchema,
  ListJobsResponseSchema,
} from "@osqueue/proto";
import type { QueueTransportAdapter, WsTransportConfig } from "./types.js";

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: TransportRequestError | TransportConnectionError) => void;
  timer: ReturnType<typeof setTimeout>;
};
const encoder = new TextEncoder();

function wsUrlFromHttp(baseUrl: string, wsPath: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = wsPath;
  url.search = "";
  return url.toString();
}

function decodeMessage(data: unknown): string {
  if (typeof data === "string") return data;
  const decoder = new TextDecoder();
  if (data instanceof ArrayBuffer) return decoder.decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return decoder.decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  return String(data ?? "");
}

async function getWebSocketCtor(): Promise<any> {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  const ws = await import("ws");
  return ws.WebSocket;
}

export function createWsAdapter(config: WsTransportConfig): QueueTransportAdapter {
  if (!config.baseUrl) {
    throw new TransportConfigError("WebSocket transport requires baseUrl");
  }
  const timeoutMs = config.requestTimeoutMs ?? 10_000;
  const wsPath = config.wsPath ?? "/v1/ws";

  let socket: any | null = null;
  let openPromise: Promise<void> | null = null;
  let requestCounter = 0;
  const pending = new Map<string, PendingRequest>();

  const resetSocket = () => {
    socket = null;
    openPromise = null;
  };

  const rejectPending = (reason: TransportConnectionError) => {
    for (const req of pending.values()) {
      clearTimeout(req.timer);
      req.reject(reason);
    }
    pending.clear();
  };

  const ensureSocket = async () => {
    if (socket && socket.readyState === 1) return;
    if (openPromise) {
      await openPromise;
      return;
    }

    openPromise = (async () => {
      const WebSocketCtor = await getWebSocketCtor();
      socket = new WebSocketCtor(wsUrlFromHttp(config.baseUrl!, wsPath));

      await new Promise<void>((resolve, reject) => {
        const onOpen = () => resolve();
        const onError = () =>
          reject(new TransportConnectionError("WebSocket connection failed"));

        if (typeof socket.addEventListener === "function") {
          socket.addEventListener("open", onOpen, { once: true });
          socket.addEventListener("error", onError, { once: true });
          socket.addEventListener("message", (event: any) => {
            const text = decodeMessage(event.data);
            handleMessage(text);
          });
          socket.addEventListener("close", () => {
            rejectPending(new TransportConnectionError("WebSocket closed"));
            resetSocket();
          });
        } else {
          socket.once("open", onOpen);
          socket.once("error", onError);
          socket.on("message", (data: unknown) => {
            const text = decodeMessage(data);
            handleMessage(text);
          });
          socket.on("close", () => {
            rejectPending(new TransportConnectionError("WebSocket closed"));
            resetSocket();
          });
        }
      });
    })();

    try {
      await openPromise;
    } finally {
      openPromise = null;
    }
  };

  const handleMessage = (text: string) => {
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }

    const id = String(message.id ?? "");
    const pendingRequest = pending.get(id);
    if (!pendingRequest) return;

    clearTimeout(pendingRequest.timer);
    pending.delete(id);

    if (message.ok) {
      pendingRequest.resolve(message.result);
    } else {
      pendingRequest.reject(
        new TransportRequestError(
          message.error?.message ?? "WebSocket request failed",
          {
            method: typeof message.method === "string" ? message.method : undefined,
            remoteTag:
              typeof message.error?._tag === "string"
                ? message.error._tag
                : undefined,
          },
        ),
      );
    }
  };

  const request = async <T>(method: string, params: Record<string, unknown>): Promise<T> => {
    await ensureSocket();
    if (!socket) {
      throw new TransportConnectionError("WebSocket not connected");
    }

    const id = String(++requestCounter);
    const payload = JSON.stringify({ id, method, params });

    const response = await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new TransportRequestError(`WebSocket request timed out: ${method}`, {
            method,
          }),
        );
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      socket.send(payload);
    });

    return response;
  };

  return {
    async submitJob(req) {
      return await request<{ jobId: string }>("submitJob", {
        type: req.type,
        payload: req.payload,
        maxAttempts: req.maxAttempts,
      });
    },

    async claimJob(req) {
      const result = await request<{ jobId?: string; type?: string; payload?: unknown }>(
        "claimJob",
        {
          workerId: req.workerId,
          types: req.types,
        },
      );
      return {
        jobId: result.jobId,
        type: result.type ?? "",
        payload: result.payload ?? null,
      };
    },

    async heartbeat(req) {
      await request("heartbeat", {
        jobId: req.jobId,
        workerId: req.workerId,
      });
    },

    async completeJob(req) {
      await request("completeJob", {
        jobId: req.jobId,
        workerId: req.workerId,
      });
    },

    async getStats() {
      const json = await request<{
        total: number;
        unclaimed: number;
        inProgress: number;
        brokerAddress: string;
      }>("getStats", {});

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
      }>("listJobs", {});

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

    async reconnect() {
      if (socket) {
        socket.close();
      }
      resetSocket();
      await ensureSocket();
    },

    async close() {
      if (socket) {
        socket.close();
      }
      resetSocket();
    },
  };
}
