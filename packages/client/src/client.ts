import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
  QueueService,
  SubmitJobRequestSchema,
  ClaimJobRequestSchema,
  HeartbeatRequestSchema,
  CompleteJobRequestSchema,
  GetStatsRequestSchema,
  ListJobsRequestSchema,
} from "@osqueue/proto";
import type {
  GetStatsResponse,
  ListJobsResponse,
} from "@osqueue/proto";
import type { StorageBackend, QueueState, JobId, WorkerId } from "@osqueue/types";
import { QUEUE_STATE_KEY } from "@osqueue/types";
import { z } from "zod";

export type JobTypeRegistry = Record<string, z.ZodType>;
export type DefaultRegistry = Record<string, z.ZodType>;

export interface OsqueueClientOptions {
  /** Direct broker URL (e.g. "http://localhost:8080"). If provided, skips discovery. */
  brokerUrl?: string;
  /** Storage backend for broker discovery from queue.json */
  storage?: StorageBackend;
  /** Pre-built transport (e.g. from @connectrpc/connect-web for browsers) */
  transport?: Transport;
  /** How often to retry broker discovery (ms, default: 2000) */
  discoveryRetryMs?: number;
  /** HTTP version for transport (default: "1.1") — only used when transport not provided */
  httpVersion?: "1.1" | "2";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class OsqueueClient<R extends JobTypeRegistry = DefaultRegistry> {
  private client: Client<typeof QueueService> | null = null;
  private brokerUrl: string | null;
  private storage: StorageBackend | null;
  private transport: Transport | null;
  private discoveryRetryMs: number;
  private httpVersion: "1.1" | "2";
  readonly registry: R;

  constructor(options?: OsqueueClientOptions, registry?: R) {
    this.brokerUrl = options?.brokerUrl ?? null;
    this.storage = options?.storage ?? null;
    this.transport = options?.transport ?? null;
    this.discoveryRetryMs = options?.discoveryRetryMs ?? 2000;
    this.httpVersion = options?.httpVersion ?? "1.1";
    this.registry = registry ?? ({} as R);

    if (this.transport) {
      this.client = createClient(QueueService, this.transport);
    } else if (this.brokerUrl) {
      this.client = this.createNodeClient(this.brokerUrl);
    }
  }

  private createNodeClient(url: string): Client<typeof QueueService> {
    // Dynamic import to avoid bundling connect-node in browser builds
    const { createConnectTransport } = require("@connectrpc/connect-node");
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
      throw new Error("No brokerUrl, transport, or storage provided for broker discovery");
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
    this.client = this.createNodeClient(this.brokerUrl);
  }

  /** Reconnect to broker (used on connection failure) */
  async reconnect(): Promise<void> {
    if (this.transport) {
      this.client = createClient(QueueService, this.transport);
    } else {
      this.client = null;
      this.brokerUrl = null;
      await this.connect();
    }
  }

  private async getClient(): Promise<Client<typeof QueueService>> {
    if (!this.client) {
      await this.connect();
    }
    return this.client!;
  }

  async submitJob<T extends string & keyof R>(type: T, payload: z.infer<R[T]>, maxAttempts?: number): Promise<JobId> {
    const client = await this.getClient();
    const req = create(SubmitJobRequestSchema);
    req.payload = encoder.encode(JSON.stringify(payload));
    req.type = type;
    if (maxAttempts !== undefined) {
      req.maxAttempts = maxAttempts;
    }
    const res = await client.submitJob(req);
    return res.jobId as JobId;
  }

  async claimJob(
    workerId: WorkerId,
    types?: (string & keyof R)[],
  ): Promise<{ jobId: JobId; type: string; payload: unknown } | null> {
    const client = await this.getClient();
    const req = create(ClaimJobRequestSchema);
    req.workerId = workerId;
    if (types && types.length > 0) {
      req.types = types;
    }
    const res = await client.claimJob(req);
    if (!res.jobId) return null;
    return {
      jobId: res.jobId as JobId,
      type: res.type,
      payload: res.payload ? JSON.parse(decoder.decode(res.payload)) : null,
    };
  }

  async heartbeat(jobId: JobId, workerId: WorkerId): Promise<void> {
    const client = await this.getClient();
    const req = create(HeartbeatRequestSchema);
    req.jobId = jobId;
    req.workerId = workerId;
    await client.heartbeat(req);
  }

  async completeJob(jobId: JobId, workerId: WorkerId): Promise<void> {
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

  async listJobs(): Promise<ListJobsResponse> {
    const client = await this.getClient();
    const req = create(ListJobsRequestSchema);
    return await client.listJobs(req);
  }
}
