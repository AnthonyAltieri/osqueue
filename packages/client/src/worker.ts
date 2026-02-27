import { z } from "zod";
import { OsqueueClient, type JobTypeRegistry, type DefaultRegistry } from "./client.js";
import type { JobId, WorkerId } from "@osqueue/types";

export type TypedJobHandler<P = unknown> = (
  payload: P,
  signal: AbortSignal,
) => Promise<void>;

export type JobHandlerMap<R extends JobTypeRegistry = DefaultRegistry> = {
  [T in keyof R]?: TypedJobHandler<z.infer<R[T]>>;
};

export interface WorkerOptions<R extends JobTypeRegistry = DefaultRegistry> {
  client: OsqueueClient<R>;
  workerId?: string;
  /** Per-type job handlers */
  handlers: JobHandlerMap<R>;
  /** Poll interval in ms (default: 1000) */
  pollIntervalMs?: number;
  /** Heartbeat interval in ms (default: 5000) */
  heartbeatIntervalMs?: number;
  /** Max concurrent jobs (default: 1) */
  concurrency?: number;
}

export class Worker<R extends JobTypeRegistry = DefaultRegistry> {
  private client: OsqueueClient<R>;
  private workerId: WorkerId;
  private handlers: JobHandlerMap<R>;
  private handledTypes: (string & keyof R)[];
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private concurrency: number;
  private running = false;
  private activeJobs = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private abortControllers = new Map<JobId, AbortController>();
  private heartbeatTimers = new Map<JobId, ReturnType<typeof setInterval>>();

  constructor(options: WorkerOptions<R>) {
    this.client = options.client;
    this.workerId = (options.workerId ?? crypto.randomUUID()) as WorkerId;
    this.handlers = options.handlers;
    this.handledTypes = Object.keys(options.handlers) as (string & keyof R)[];
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
    this.concurrency = options.concurrency ?? 1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Signal all active jobs to abort
    for (const [jobId, controller] of this.abortControllers) {
      controller.abort();
    }

    // Clear heartbeat timers
    for (const [jobId, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    // Wait for active jobs to finish
    while (this.activeJobs > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get activeJobCount(): number {
    return this.activeJobs;
  }

  private poll(): void {
    if (!this.running) return;

    if (this.activeJobs < this.concurrency) {
      this.tryClaimAndProcess();
    }

    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async tryClaimAndProcess(): Promise<void> {
    try {
      const job = await this.client.claimJob(
        this.workerId,
        this.handledTypes.length > 0 ? this.handledTypes : undefined,
      );
      if (!job) return;

      // Validate payload against Zod schema if registered
      const schema = this.client.registry[job.type as keyof R];
      let validatedPayload = job.payload;
      if (schema) {
        const parseResult = schema.safeParse(job.payload);
        if (!parseResult.success) {
          console.error(
            `Invalid payload for job ${job.jobId} (type "${job.type}"): ${parseResult.error.message}`,
          );
          await this.client.completeJob(job.jobId, this.workerId);
          return;
        }
        validatedPayload = parseResult.data;
      }

      const handler = this.handlers[job.type as keyof R] as TypedJobHandler | undefined;
      if (!handler) {
        console.error(`No handler for job type "${job.type}", job ${job.jobId}`);
        return;
      }

      this.activeJobs++;
      const controller = new AbortController();
      this.abortControllers.set(job.jobId, controller);

      // Start heartbeat
      const heartbeatTimer = setInterval(async () => {
        try {
          await this.client.heartbeat(job.jobId, this.workerId);
        } catch {
          // Ignore heartbeat errors
        }
      }, this.heartbeatIntervalMs);
      this.heartbeatTimers.set(job.jobId, heartbeatTimer);

      try {
        await handler(validatedPayload, controller.signal);
        // Complete the job on success
        await this.client.completeJob(job.jobId, this.workerId);
      } catch (err) {
        // Job failed — don't complete, let heartbeat expire for retry
        if (controller.signal.aborted) {
          // Graceful shutdown — don't log
        } else {
          console.error(`Job ${job.jobId} failed:`, err);
        }
      } finally {
        clearInterval(heartbeatTimer);
        this.heartbeatTimers.delete(job.jobId);
        this.abortControllers.delete(job.jobId);
        this.activeJobs--;
      }
    } catch (err) {
      // Connection error — try to reconnect
      try {
        await this.client.reconnect();
      } catch {
        // Will retry on next poll
      }
    }
  }
}
