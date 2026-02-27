import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import type { ConnectRouter } from "@connectrpc/connect";
import { QueueService } from "@osqueue/proto";
import { GroupCommitEngine, BrokerElection } from "@osqueue/core";
import type { StorageBackend } from "@osqueue/types";
import { DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS } from "@osqueue/types";
import { createQueueServiceImpl } from "./service.js";

export interface BrokerServerOptions {
  storage: StorageBackend;
  host?: string;
  port?: number;
  /** Interval for broker heartbeat writes (ms, default: 3000) */
  heartbeatIntervalMs?: number;
  /** Broker heartbeat staleness timeout (ms, default: 10000) */
  heartbeatTimeoutMs?: number;
  /** Group commit interval (ms, default: 50) */
  groupCommitIntervalMs?: number;
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
    // Try to become the broker
    const result = await this.election.tryElect();
    if (result.status === "other_leader") {
      throw new Error(
        `Another broker is active: ${result.leader}. Cannot start.`,
      );
    }
    if (result.status === "conflict") {
      throw new Error("CAS conflict during election. Retry later.");
    }

    // Start the group commit engine
    await this.engine.start();

    // Register as broker in state
    await this.engine.submit({
      type: "register_broker",
      brokerAddress: `${this.options.host}:${this.options.port}`,
      timestamp: Date.now(),
    });

    // Enable CORS for browser clients
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

    // Health check for ALB
    this.server.get("/healthz", async () => ({ status: "ok" }));

    // Raw queue state (same JSON as in S3)
    this.server.get("/state", async () => {
      const state = this.engine.getCachedState();
      return state ?? {};
    });

    // Set up ConnectRPC routes
    const serviceImpl = createQueueServiceImpl(this.engine);
    await this.server.register(fastifyConnectPlugin, {
      routes(router: ConnectRouter) {
        router.service(QueueService, serviceImpl);
      },
    });

    // Start HTTP server
    await this.server.listen({
      host: this.options.host,
      port: this.options.port,
    });

    this.running = true;

    // Start heartbeat loop
    this.heartbeatTimer = setInterval(async () => {
      if (!this.running) return;
      try {
        // Write broker heartbeat via group commit
        await this.engine.submit({
          type: "register_broker",
          brokerAddress: `${this.options.host}:${this.options.port}`,
          timestamp: Date.now(),
        });

        // Check if we're still the leader
        const isLeader = await this.election.checkLeadership();
        if (!isLeader) {
          console.log("Lost leadership — shutting down");
          await this.stop();
        }
      } catch {
        // Ignore heartbeat errors — next cycle will retry
      }
    }, this.options.heartbeatIntervalMs);
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
