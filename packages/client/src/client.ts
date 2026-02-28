import type { Transport } from "@connectrpc/connect";
import type { StorageBackend, QueueState, JobId, WorkerId } from "@osqueue/types";
import { DiscoveryError, QUEUE_STATE_KEY } from "@osqueue/types";
import { z } from "zod";
import type {
  BuiltinTransportConfig,
  QueueTransportAdapter,
} from "./transports/types.js";

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
    }
  }

  private async createAdapter(url: string): Promise<QueueTransportAdapter> {
    if (isQueueTransportAdapter(this.transportOption)) {
      return this.transportOption;
    }

    if (isConnectTransport(this.transportOption)) {
      const { createConnectTransport } = await import("./transports/connect.js");
      return createConnectTransport({
        baseUrl: url,
        transport: this.transportOption,
        httpVersion: this.httpVersion,
      });
    }

    if (isBuiltinTransportConfig(this.transportOption)) {
      switch (this.transportOption.kind) {
        case "rest": {
          const { createRestTransport } = await import("./transports/rest.js");
          return createRestTransport({
            kind: "rest",
            baseUrl: this.transportOption.baseUrl ?? url,
            fetchImpl: this.transportOption.fetchImpl,
          });
        }
        case "ws": {
          const { createWsTransport } = await import("./transports/ws.js");
          return createWsTransport({
            kind: "ws",
            baseUrl: this.transportOption.baseUrl ?? url,
            requestTimeoutMs: this.transportOption.requestTimeoutMs,
            wsPath: this.transportOption.wsPath,
          });
        }
        case "connect":
        default: {
          const { createConnectTransport } = await import("./transports/connect.js");
          return createConnectTransport({
            kind: "connect",
            baseUrl: this.transportOption.baseUrl ?? url,
            transport: this.transportOption.transport,
            httpVersion: this.transportOption.httpVersion ?? this.httpVersion,
          });
        }
      }
    }

    const { createConnectTransport } = await import("./transports/connect.js");
    return createConnectTransport({
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
    this.adapter = await this.createAdapter(this.brokerUrl);
  }

  async reconnect(): Promise<void> {
    if (this.adapter?.reconnect) {
      await this.adapter.reconnect();
      return;
    }

    await this.adapter?.close?.();
    this.adapter = null;

    if (this.brokerUrl) {
      this.adapter = await this.createAdapter(this.brokerUrl);
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
      if (this.brokerUrl) {
        this.adapter = await this.createAdapter(this.brokerUrl);
      } else {
        await this.connect();
      }
    }
    return this.adapter!;
  }

  async submitJob<T extends string & keyof R>(
    type: T,
    payload: z.infer<R[T]>,
    maxAttempts?: number,
  ): Promise<JobId> {
    const adapter = await this.getAdapter();
    const result = await adapter.submitJob({
      type,
      payload,
      maxAttempts,
    });
    return result.jobId as JobId;
  }

  async claimJob(
    workerId: WorkerId,
    types?: (string & keyof R)[],
  ): Promise<{ jobId: JobId; type: string; payload: unknown } | null> {
    const adapter = await this.getAdapter();
    const result = await adapter.claimJob({
      workerId,
      types,
    });

    if (!result.jobId) return null;

    return {
      jobId: result.jobId as JobId,
      type: result.type,
      payload: result.payload,
    };
  }

  async heartbeat(jobId: JobId, workerId: WorkerId): Promise<void> {
    const adapter = await this.getAdapter();
    await adapter.heartbeat({ jobId, workerId });
  }

  async completeJob(jobId: JobId, workerId: WorkerId): Promise<void> {
    const adapter = await this.getAdapter();
    await adapter.completeJob({ jobId, workerId });
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
