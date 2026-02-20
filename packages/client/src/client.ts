import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { create } from "@bufbuild/protobuf";
import {
  QueueService,
  SubmitJobRequestSchema,
  ClaimJobRequestSchema,
  HeartbeatRequestSchema,
  CompleteJobRequestSchema,
  GetStatsRequestSchema,
} from "@osqueue/proto";
import type {
  SubmitJobResponse,
  ClaimJobResponse,
  GetStatsResponse,
} from "@osqueue/proto";
import type { StorageBackend, QueueState } from "@osqueue/types";
import { QUEUE_STATE_KEY } from "@osqueue/types";

export interface OsqueueClientOptions {
  /** Direct broker URL (e.g. "http://localhost:8080"). If provided, skips discovery. */
  brokerUrl?: string;
  /** Storage backend for broker discovery from queue.json */
  storage?: StorageBackend;
  /** How often to retry broker discovery (ms, default: 2000) */
  discoveryRetryMs?: number;
  /** HTTP version for transport (default: "1.1") */
  httpVersion?: "1.1" | "2";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class OsqueueClient {
  private client: Client<typeof QueueService> | null = null;
  private brokerUrl: string | null;
  private storage: StorageBackend | null;
  private discoveryRetryMs: number;
  private httpVersion: "1.1" | "2";

  constructor(options: OsqueueClientOptions) {
    this.brokerUrl = options.brokerUrl ?? null;
    this.storage = options.storage ?? null;
    this.discoveryRetryMs = options.discoveryRetryMs ?? 2000;
    this.httpVersion = options.httpVersion ?? "1.1";

    if (this.brokerUrl) {
      this.client = this.createGrpcClient(this.brokerUrl);
    }
  }

  private createGrpcClient(url: string): Client<typeof QueueService> {
    const transport = createConnectTransport({
      baseUrl: url,
      httpVersion: this.httpVersion,
    });
    return createClient(QueueService, transport);
  }

  /** Discover broker address from queue.json and connect */
  async connect(): Promise<void> {
    if (this.client) return;

    if (!this.storage) {
      throw new Error(
        "No brokerUrl or storage provided for broker discovery",
      );
    }

    const result = await this.storage.read(QUEUE_STATE_KEY);
    if (!result) {
      throw new Error("Queue state not found — is a broker running?");
    }

    const state = JSON.parse(decoder.decode(result.data)) as QueueState;
    if (!state.broker) {
      throw new Error("No broker registered in queue state");
    }

    this.brokerUrl = `http://${state.broker}`;
    this.client = this.createGrpcClient(this.brokerUrl);
  }

  /** Reconnect to broker (used on connection failure) */
  async reconnect(): Promise<void> {
    this.client = null;
    this.brokerUrl = null;
    await this.connect();
  }

  private async getClient(): Promise<Client<typeof QueueService>> {
    if (!this.client) {
      await this.connect();
    }
    return this.client!;
  }

  async submitJob(
    payload: unknown,
    maxAttempts?: number,
  ): Promise<string> {
    const client = await this.getClient();
    const req = create(SubmitJobRequestSchema);
    req.payload = encoder.encode(JSON.stringify(payload));
    if (maxAttempts !== undefined) {
      req.maxAttempts = maxAttempts;
    }
    const res = await client.submitJob(req);
    return res.jobId;
  }

  async claimJob(
    workerId: string,
  ): Promise<{ jobId: string; payload: unknown } | null> {
    const client = await this.getClient();
    const req = create(ClaimJobRequestSchema);
    req.workerId = workerId;
    const res = await client.claimJob(req);
    if (!res.jobId) return null;
    return {
      jobId: res.jobId,
      payload: res.payload ? JSON.parse(decoder.decode(res.payload)) : null,
    };
  }

  async heartbeat(jobId: string, workerId: string): Promise<void> {
    const client = await this.getClient();
    const req = create(HeartbeatRequestSchema);
    req.jobId = jobId;
    req.workerId = workerId;
    await client.heartbeat(req);
  }

  async completeJob(jobId: string, workerId: string): Promise<void> {
    const client = await this.getClient();
    const req = create(CompleteJobRequestSchema);
    req.jobId = jobId;
    req.workerId = workerId;
    await client.completeJob(req);
  }

  async getStats(): Promise<GetStatsResponse> {
    const client = await this.getClient();
    const req = create(GetStatsRequestSchema);
    return await client.getStats(req);
  }
}
