import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { WebSocket } from "@fastify/websocket";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import type { ConnectRouter } from "@connectrpc/connect";
import { QueueService } from "@osqueue/proto";
import { GroupCommitEngine, BrokerElection } from "@osqueue/core";
import type { StorageBackend } from "@osqueue/types";
import {
  BrokerLeadershipError,
  BrokerProtocolError,
  DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS,
  isTaggedError,
  wrapUnknownError,
} from "@osqueue/types";
import { createQueueServiceImpl } from "./service.js";
import {
  claimJobOperation,
  completeJobOperation,
  getQueueSnapshot,
  getQueueStats,
  heartbeatOperation,
  submitJobOperation,
} from "./operations.js";

export interface BrokerServerOptions {
  storage: StorageBackend;
  host?: string;
  port?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  groupCommitIntervalMs?: number;
}

function errorPayload(error: unknown): { _tag: string; message: string } {
  const tagged = wrapUnknownError(
    error,
    (message, cause) => new BrokerProtocolError(message, { cause }),
  );
  return {
    _tag: tagged._tag,
    message: tagged.message,
  };
}

export class BrokerServer {
  private engine: GroupCommitEngine;
  private election: BrokerElection;
  private server: ReturnType<typeof Fastify>;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private options: Required<BrokerServerOptions>;

  constructor(opts: BrokerServerOptions) {
    this.options = {
      storage: opts.storage,
      host: opts.host ?? "0.0.0.0",
      port: opts.port ?? 8080,
      heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 3000,
      heartbeatTimeoutMs:
        opts.heartbeatTimeoutMs ?? DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS,
      groupCommitIntervalMs: opts.groupCommitIntervalMs ?? 50,
    };

    const address = `${this.options.host}:${this.options.port}`;

    this.engine = new GroupCommitEngine({
      storage: opts.storage,
      intervalMs: this.options.groupCommitIntervalMs,
    });

    this.election = new BrokerElection({
      storage: opts.storage,
      brokerAddress: address,
      heartbeatTimeoutMs: this.options.heartbeatTimeoutMs,
    });

    this.server = Fastify({ logger: false });
  }

  async start(): Promise<void> {
    const result = await this.election.tryElect();
    if (result.status === "other_leader") {
      throw new BrokerLeadershipError(
        `Another broker is active: ${result.leader}. Cannot start.`,
        { leader: result.leader },
      );
    }
    if (result.status === "conflict") {
      throw new BrokerLeadershipError("CAS conflict during election. Retry later.");
    }

    await this.engine.start();

    await this.engine.submit({
      type: "register_broker",
      brokerAddress: `${this.options.host}:${this.options.port}`,
      timestamp: Date.now(),
    });

    await this.server.register(cors, {
      origin: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Connect-Protocol-Version",
        "Connect-Timeout-Ms",
      ],
      exposedHeaders: ["Connect-Protocol-Version"],
    });

    await this.server.register(websocket);
    this.server.setErrorHandler(
      (
        error: FastifyError,
        _request: FastifyRequest,
        reply: FastifyReply,
      ) => {
      const tagged = wrapUnknownError(
        error,
        (message, cause) => new BrokerProtocolError(message, { cause }),
      );
      if (isTaggedError(error)) {
        void reply.status(500).send({
          _tag: error._tag,
          message: error.message,
        });
        return;
      }
      void reply.status(500).send({
        _tag: tagged._tag,
        message: tagged.message,
      });
      },
    );

    this.server.get("/healthz", async () => ({ status: "ok" }));

    this.server.get("/state", async () => {
      const state = this.engine.getCachedState();
      return state ?? {};
    });

    this.server.post("/v1/jobs", async (request: FastifyRequest) => {
      const body = request.body as {
        payload: unknown;
        type?: string;
        maxAttempts?: number;
      };
      return await submitJobOperation(this.engine, {
        payload: body.payload,
        type: body.type,
        maxAttempts: body.maxAttempts,
      });
    });

    this.server.post("/v1/jobs/claim", async (request: FastifyRequest) => {
      const body = request.body as {
        workerId: string;
        types?: string[];
      };
      return await claimJobOperation(this.engine, body);
    });

    this.server.post(
      "/v1/jobs/:jobId/heartbeat",
      async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { jobId: string };
      const body = request.body as { workerId: string };
      await heartbeatOperation(this.engine, {
        jobId: params.jobId,
        workerId: body.workerId,
      });
      return reply.status(204).send();
      },
    );

    this.server.post(
      "/v1/jobs/:jobId/complete",
      async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { jobId: string };
      const body = request.body as { workerId: string };
      await completeJobOperation(this.engine, {
        jobId: params.jobId,
        workerId: body.workerId,
      });
      return reply.status(204).send();
      },
    );

    this.server.get("/v1/stats", async () => {
      return getQueueStats(this.engine.getCachedState());
    });

    this.server.get("/v1/jobs", async () => {
      const snapshot = getQueueSnapshot(this.engine);
      return {
        ...snapshot.stats,
        jobs: snapshot.jobs,
      };
    });

    this.server.get(
      "/v1/ws",
      { websocket: true },
      (socket: WebSocket) => {
      socket.on("message", async (rawMessage: Buffer | string | Buffer[]) => {
        const text =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? Buffer.concat(rawMessage).toString()
              : rawMessage.toString();
        let message: any;

        try {
          message = JSON.parse(text);
        } catch {
          const tagged = new BrokerProtocolError("Invalid JSON");
          socket.send(
            JSON.stringify({
              id: null,
              ok: false,
              error: { _tag: tagged._tag, message: tagged.message },
            }),
          );
          return;
        }

        const id = message?.id ?? null;

        try {
          const result = await this.dispatchWs(message?.method, message?.params ?? {});
          socket.send(JSON.stringify({ id, ok: true, result }));
        } catch (error) {
          const payload = errorPayload(error);
          socket.send(
            JSON.stringify({
              id,
              ok: false,
              error: payload,
            }),
          );
        }
      });
      },
    );

    const serviceImpl = createQueueServiceImpl(this.engine);
    await this.server.register(fastifyConnectPlugin, {
      routes(router: ConnectRouter) {
        router.service(QueueService, serviceImpl);
      },
    });

    await this.server.listen({
      host: this.options.host,
      port: this.options.port,
    });

    this.running = true;

    this.heartbeatTimer = setInterval(async () => {
      if (!this.running) return;
      try {
        await this.engine.submit({
          type: "register_broker",
          brokerAddress: `${this.options.host}:${this.options.port}`,
          timestamp: Date.now(),
        });

        const isLeader = await this.election.checkLeadership();
        if (!isLeader) {
          console.log("Lost leadership — shutting down");
          await this.stop();
        }
      } catch {
        // Ignore heartbeat errors — next cycle will retry.
      }
    }, this.options.heartbeatIntervalMs);
  }

  private async dispatchWs(method: string, params: Record<string, unknown>) {
    switch (method) {
      case "submitJob":
        return await submitJobOperation(this.engine, {
          payload: params.payload,
          type: typeof params.type === "string" ? params.type : undefined,
          maxAttempts:
            typeof params.maxAttempts === "number" ? params.maxAttempts : undefined,
        });
      case "claimJob":
        return await claimJobOperation(this.engine, {
          workerId: String(params.workerId ?? ""),
          types: Array.isArray(params.types)
            ? params.types.map((value) => String(value))
            : undefined,
        });
      case "heartbeat":
        await heartbeatOperation(this.engine, {
          jobId: String(params.jobId ?? ""),
          workerId: String(params.workerId ?? ""),
        });
        return {};
      case "completeJob":
        await completeJobOperation(this.engine, {
          jobId: String(params.jobId ?? ""),
          workerId: String(params.workerId ?? ""),
        });
        return {};
      case "getStats":
        return getQueueStats(this.engine.getCachedState());
      case "listJobs": {
        const snapshot = getQueueSnapshot(this.engine);
        return {
          ...snapshot.stats,
          jobs: snapshot.jobs,
        };
      }
      default:
        throw new BrokerProtocolError(
          `Unsupported WS method: ${String(method)}`,
          { method: String(method) },
        );
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.engine.stop();
    await this.server.close();
  }

  get address(): string {
    return `${this.options.host}:${this.options.port}`;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
