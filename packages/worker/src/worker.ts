import { z } from "zod";
import { OsqueueClient, type JobTypeRegistry, type DefaultRegistry } from "@osqueue/client";
import type { JobId, WorkerId } from "@osqueue/types";
import {
  createTracer,
  withSpan,
  OSQUEUE_JOB_ID,
  OSQUEUE_JOB_TYPE,
  OSQUEUE_WORKER_ID,
} from "@osqueue/otel";

const tracer = createTracer("@osqueue/worker");

export type TypedJobHandler<P = unknown> = (
  payload: P,
  signal: AbortSignal,
) => Promise<void>;

export type JobHandlerMap<R extends JobTypeRegistry = DefaultRegistry> = {
  [T in keyof R]?: TypedJobHandler<z.infer<R[T]>>;
};

export interface ClaimedJobInfo {
  jobId: JobId;
  type: string;
  payload: unknown;
}

export interface WorkerOptions<R extends JobTypeRegistry = DefaultRegistry> {
  client: OsqueueClient<R>;
  workerId?: string;
  handlers: JobHandlerMap<R>;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  concurrency?: number;
  onJobClaimed?: (job: ClaimedJobInfo) => void;
  onJobCompleted?: (job: ClaimedJobInfo) => void;
  onJobFailed?: (job: ClaimedJobInfo, error: unknown) => void;
}

export class Worker<R extends JobTypeRegistry = DefaultRegistry> {
  private client: OsqueueClient<R>;
  private workerId: WorkerId;
  private handlers: JobHandlerMap<R>;
  private handledTypes: (string & keyof R)[];
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private concurrency: number;
  private onJobClaimed?: (job: ClaimedJobInfo) => void;
  private onJobCompleted?: (job: ClaimedJobInfo) => void;
  private onJobFailed?: (job: ClaimedJobInfo, error: unknown) => void;
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
    this.onJobClaimed = options.onJobClaimed;
    this.onJobCompleted = options.onJobCompleted;
    this.onJobFailed = options.onJobFailed;
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

    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

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

      await withSpan(tracer, "worker.processJob", {
        [OSQUEUE_JOB_ID]: job.jobId,
        [OSQUEUE_JOB_TYPE]: job.type,
        [OSQUEUE_WORKER_ID]: this.workerId,
      }, async (span) => {
        const claimed: ClaimedJobInfo = {
          jobId: job.jobId,
          type: job.type,
          payload: job.payload,
        };
        this.onJobClaimed?.(claimed);

        const schema = this.client.registry[job.type as keyof R];
        let validatedPayload = job.payload;
        if (schema) {
          const parseResult = schema.safeParse(job.payload);
          if (!parseResult.success) {
            span.addEvent("validation_failed");
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
          span.addEvent("no_handler");
          console.error(`No handler for job type "${job.type}", job ${job.jobId}`);
          return;
        }

        this.activeJobs++;
        const controller = new AbortController();
        this.abortControllers.set(job.jobId, controller);

        const heartbeatTimer = setInterval(async () => {
          try {
            await this.client.heartbeat(job.jobId, this.workerId);
          } catch {
            // Ignore heartbeat errors; retry next interval.
          }
        }, this.heartbeatIntervalMs);
        this.heartbeatTimers.set(job.jobId, heartbeatTimer);

        try {
          await handler(validatedPayload, controller.signal);
          await this.client.completeJob(job.jobId, this.workerId);
          span.addEvent("job_completed");
          this.onJobCompleted?.(claimed);
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(`Job ${job.jobId} failed:`, error);
            this.onJobFailed?.(claimed, error);
          }
          throw error;
        } finally {
          clearInterval(heartbeatTimer);
          this.heartbeatTimers.delete(job.jobId);
          this.abortControllers.delete(job.jobId);
          this.activeJobs--;
        }
      });
    } catch {
      try {
        await this.client.reconnect();
      } catch {
        // Retry on next poll.
      }
    }
  }
}
