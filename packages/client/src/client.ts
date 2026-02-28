import type { Transport } from "@connectrpc/connect";
import type { StorageBackend, QueueState, JobId, WorkerId } from "@osqueue/types";
import { DiscoveryError, QUEUE_STATE_KEY } from "@osqueue/types";
import {
  createTracer,
  withSpan,
  OSQUEUE_JOB_ID,
  OSQUEUE_JOB_TYPE,
  OSQUEUE_WORKER_ID,
  OSQUEUE_JOBS_CLAIMED,
} from "@osqueue/otel";
import { z } from "zod";

const tracer = createTracer("@osqueue/client");
import {
  createConnectAdapter,
  createRestAdapter,
  createWsAdapter,
  type BuiltinTransportConfig,
  type QueueTransportAdapter,
} from "./transports/index.js";

export type JobTypeRegistry = Record<string, z.ZodType>;
export type DefaultRegistry = Record<string, z.ZodType>;

export interface OsqueueClientOptions {
  brokerUrl?: string;
  storage?: StorageBackend;
  transport?: Transport | BuiltinTransportConfig | QueueTransportAdapter;
  discoveryRetryMs?: number;
  httpVersion?: "1.1" | "2";
}

const decoder = new TextDecoder();

function isBuiltinTransportConfig(value: unknown): value is BuiltinTransportConfig {
  return typeof value === "object" && value !== null && "kind" in value;
}

function isQueueTransportAdapter(value: unknown): value is QueueTransportAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    "submitJob" in value &&
    typeof (value as QueueTransportAdapter).submitJob === "function"
  );
}

function isConnectTransport(value: unknown): value is Transport {
  return (
    typeof value === "object" &&
    value !== null &&
    "unary" in value &&
    typeof (value as Transport).unary === "function"
  );
}

export class OsqueueClient<R extends JobTypeRegistry = DefaultRegistry> {
  private adapter: QueueTransportAdapter | null = null;
  private brokerUrl: string | null;
  private storage: StorageBackend | null;
  private transportOption: Transport | BuiltinTransportConfig | QueueTransportAdapter | null;
  private discoveryRetryMs: number;
  private httpVersion: "1.1" | "2";
  readonly registry: R;

  constructor(options?: OsqueueClientOptions, registry?: R) {
    this.brokerUrl = options?.brokerUrl ?? null;
    this.storage = options?.storage ?? null;
    this.transportOption = options?.transport ?? null;
    this.discoveryRetryMs = options?.discoveryRetryMs ?? 2000;
    this.httpVersion = options?.httpVersion ?? "1.1";
    this.registry = registry ?? ({} as R);

    if (isQueueTransportAdapter(this.transportOption)) {
      this.adapter = this.transportOption;
    } else if (this.brokerUrl) {
      this.adapter = this.createAdapter(this.brokerUrl);
    }
  }

  private createAdapter(url: string): QueueTransportAdapter {
    if (isQueueTransportAdapter(this.transportOption)) {
      return this.transportOption;
    }

    if (isConnectTransport(this.transportOption)) {
      return createConnectAdapter({
        baseUrl: url,
        transport: this.transportOption,
        httpVersion: this.httpVersion,
      });
    }

    if (isBuiltinTransportConfig(this.transportOption)) {
      switch (this.transportOption.kind) {
        case "rest":
          return createRestAdapter({
            kind: "rest",
            baseUrl: this.transportOption.baseUrl ?? url,
            fetchImpl: this.transportOption.fetchImpl,
          });
        case "ws":
          return createWsAdapter({
            kind: "ws",
            baseUrl: this.transportOption.baseUrl ?? url,
            requestTimeoutMs: this.transportOption.requestTimeoutMs,
            wsPath: this.transportOption.wsPath,
          });
        case "connect":
        default:
          return createConnectAdapter({
            kind: "connect",
            baseUrl: this.transportOption.baseUrl ?? url,
            transport: this.transportOption.transport,
            httpVersion: this.transportOption.httpVersion ?? this.httpVersion,
          });
      }
    }

    return createConnectAdapter({
      kind: "connect",
      baseUrl: url,
      httpVersion: this.httpVersion,
    });
  }

  async connect(): Promise<void> {
    if (this.adapter) return;

    if (!this.storage) {
      throw new DiscoveryError(
        "No brokerUrl, transport, or storage provided for broker discovery",
      );
    }

    const result = await this.storage.read(QUEUE_STATE_KEY);
    if (!result) {
      throw new DiscoveryError("Queue state not found — is a broker running?");
    }

    const state = JSON.parse(decoder.decode(result.data)) as QueueState;
    if (!state.broker) {
      throw new DiscoveryError("No broker registered in queue state");
    }

    this.brokerUrl = `http://${state.broker}`;
    this.adapter = this.createAdapter(this.brokerUrl);
  }

  async reconnect(): Promise<void> {
    if (this.adapter?.reconnect) {
      await this.adapter.reconnect();
      return;
    }

    await this.adapter?.close?.();
    this.adapter = null;

    if (this.brokerUrl) {
      this.adapter = this.createAdapter(this.brokerUrl);
      return;
    }

    await this.connect();

    if (!this.adapter) {
      await new Promise((r) => setTimeout(r, this.discoveryRetryMs));
      await this.connect();
    }
  }

  private async getAdapter(): Promise<QueueTransportAdapter> {
    if (!this.adapter) {
      await this.connect();
    }
    return this.adapter!;
  }

  async submitJob<T extends string & keyof R>(
    type: T,
    payload: z.infer<R[T]>,
    maxAttempts?: number,
  ): Promise<JobId> {
    return withSpan(tracer, "client.submitJob", {
      [OSQUEUE_JOB_TYPE]: type,
    }, async (span) => {
      const adapter = await this.getAdapter();
      const result = await adapter.submitJob({
        type,
        payload,
        maxAttempts,
      });
      span.setAttribute(OSQUEUE_JOB_ID, result.jobId);
      return result.jobId as JobId;
    });
  }

  async claimJob(
    workerId: WorkerId,
    types?: (string & keyof R)[],
  ): Promise<{ jobId: JobId; type: string; payload: unknown } | null> {
    return withSpan(tracer, "client.claimJob", {
      [OSQUEUE_WORKER_ID]: workerId,
    }, async (span) => {
      const adapter = await this.getAdapter();
      const result = await adapter.claimJob({
        workerId,
        types,
      });

      if (!result.jobId) {
        span.setAttribute(OSQUEUE_JOBS_CLAIMED, 0);
        return null;
      }

      span.setAttribute(OSQUEUE_JOB_ID, result.jobId);
      span.setAttribute(OSQUEUE_JOBS_CLAIMED, 1);
      return {
        jobId: result.jobId as JobId,
        type: result.type,
        payload: result.payload,
      };
    });
  }

  async heartbeat(jobId: JobId, workerId: WorkerId): Promise<void> {
    return withSpan(tracer, "client.heartbeat", {
      [OSQUEUE_JOB_ID]: jobId,
      [OSQUEUE_WORKER_ID]: workerId,
    }, async () => {
      const adapter = await this.getAdapter();
      await adapter.heartbeat({ jobId, workerId });
    });
  }

  async completeJob(jobId: JobId, workerId: WorkerId): Promise<void> {
    return withSpan(tracer, "client.completeJob", {
      [OSQUEUE_JOB_ID]: jobId,
      [OSQUEUE_WORKER_ID]: workerId,
    }, async () => {
      const adapter = await this.getAdapter();
      await adapter.completeJob({ jobId, workerId });
    });
  }

  async getStats() {
    const adapter = await this.getAdapter();
    return await adapter.getStats();
  }

  async listJobs() {
    const adapter = await this.getAdapter();
    return await adapter.listJobs();
  }
}
