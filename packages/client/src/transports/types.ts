import type { Transport } from "@connectrpc/connect";
import type { GetStatsResponse, ListJobsResponse } from "@osqueue/proto";

export type BuiltinTransportKind = "connect" | "rest" | "ws";

export interface ConnectTransportConfig {
  kind?: "connect";
  baseUrl?: string;
  transport?: Transport;
  httpVersion?: "1.1" | "2";
}

export interface RestTransportConfig {
  kind: "rest";
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface WsTransportConfig {
  kind: "ws";
  baseUrl?: string;
  requestTimeoutMs?: number;
  wsPath?: string;
}

export type BuiltinTransportConfig =
  | ConnectTransportConfig
  | RestTransportConfig
  | WsTransportConfig;

export interface SubmitJobRequest {
  type: string;
  payload: unknown;
  maxAttempts?: number;
}

export interface ClaimJobRequest {
  workerId: string;
  types?: string[];
}

export interface ClaimJobResult {
  jobId?: string;
  type: string;
  payload: unknown | null;
}

export interface HeartbeatRequest {
  jobId: string;
  workerId: string;
}

export interface CompleteJobRequest {
  jobId: string;
  workerId: string;
}

export interface QueueTransportAdapter {
  submitJob(req: SubmitJobRequest): Promise<{ jobId: string }>;
  claimJob(req: ClaimJobRequest): Promise<ClaimJobResult>;
  heartbeat(req: HeartbeatRequest): Promise<void>;
  completeJob(req: CompleteJobRequest): Promise<void>;
  getStats(): Promise<GetStatsResponse>;
  listJobs(): Promise<ListJobsResponse>;
  reconnect?(): Promise<void>;
  close?(): Promise<void>;
}
