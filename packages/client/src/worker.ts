import { OsqueueClient } from "./client.js";

export type JobHandler = (
  payload: unknown,
  signal: AbortSignal,
) => Promise<void>;

export interface WorkerOptions {
  client: OsqueueClient;
  workerId?: string;
  /** Job processing function */
  handler: JobHandler;
  /** Poll interval in ms (default: 1000) */
  pollIntervalMs?: number;
  /** Heartbeat interval in ms (default: 5000) */
  heartbeatIntervalMs?: number;
  /** Max concurrent jobs (default: 1) */
  concurrency?: number;
}

export class Worker {
  private client: OsqueueClient;
  private workerId: string;
  private handler: JobHandler;
  private pollIntervalMs: number;
  private heartbeatIntervalMs: number;
  private concurrency: number;
  private running = false;
  private activeJobs = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private abortControllers = new Map<string, AbortController>();
  private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(options: WorkerOptions) {
    this.client = options.client;
    this.workerId = options.workerId ?? crypto.randomUUID();
    this.handler = options.handler;
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
      const job = await this.client.claimJob(this.workerId);
      if (!job) return;

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
        await this.handler(job.payload, controller.signal);
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
