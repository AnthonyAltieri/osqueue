import { useState, useRef, useCallback, useEffect } from "react";
import { Worker } from "@osqueue/client";
import { getQueueClient, registry } from "./queue-client";

export interface ActiveJob {
  jobId: string;
  type: string;
  startedAt: number;
  progress: number;
}

export interface WorkerState {
  running: boolean;
  workerId: string;
  completedCount: number;
  activeJobs: ActiveJob[];
}

// Simulated processing durations (ms)
const PROCESSING_TIME: Record<string, number> = {
  "email:send": 3000,
  "report:generate": 5000,
};

export function useWorker() {
  const [state, setState] = useState<WorkerState>({
    running: false,
    workerId: "",
    completedCount: 0,
    activeJobs: [],
  });

  const workerRef = useRef<Worker<typeof registry> | null>(null);
  const activeJobsRef = useRef<Map<string, ActiveJob>>(new Map());
  const completedRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update progress bars at 60fps-ish
  const startProgressUpdates = useCallback(() => {
    if (progressTimerRef.current) return;
    progressTimerRef.current = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, job] of activeJobsRef.current) {
        const duration = PROCESSING_TIME[job.type] ?? 4000;
        const elapsed = now - job.startedAt;
        const newProgress = Math.min(elapsed / duration, 0.99);
        if (newProgress !== job.progress) {
          job.progress = newProgress;
          changed = true;
        }
      }
      if (changed) {
        setState((prev) => ({
          ...prev,
          activeJobs: Array.from(activeJobsRef.current.values()),
        }));
      }
    }, 50);
  }, []);

  const stopProgressUpdates = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (workerRef.current) return;

    const client = getQueueClient();
    const workerId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

    const worker = new Worker({
      client,
      workerId,
      handlers: {
        "email:send": async (payload, signal) => {
          const jobId = "active"; // Will be overridden by tracking
          const duration = PROCESSING_TIME["email:send"]!;
          await simulateWork(duration, signal);
        },
        "report:generate": async (payload, signal) => {
          const duration = PROCESSING_TIME["report:generate"]!;
          await simulateWork(duration, signal);
        },
      },
      pollIntervalMs: 500,
      heartbeatIntervalMs: 5000,
      concurrency: 2,
    });

    // Monkey-patch to track active jobs
    const origClaim = client.claimJob.bind(client);
    const origComplete = client.completeJob.bind(client);

    client.claimJob = async (...args) => {
      const result = await origClaim(...args);
      if (result) {
        activeJobsRef.current.set(result.jobId, {
          jobId: result.jobId,
          type: result.type,
          startedAt: Date.now(),
          progress: 0,
        });
        setState((prev) => ({
          ...prev,
          activeJobs: Array.from(activeJobsRef.current.values()),
        }));
      }
      return result;
    };

    client.completeJob = async (...args) => {
      await origComplete(...args);
      const jobId = args[0] as string;
      activeJobsRef.current.delete(jobId);
      completedRef.current++;
      setState((prev) => ({
        ...prev,
        completedCount: completedRef.current,
        activeJobs: Array.from(activeJobsRef.current.values()),
      }));
    };

    workerRef.current = worker;
    worker.start();
    startProgressUpdates();

    setState({
      running: true,
      workerId: workerId.slice(0, 8),
      completedCount: completedRef.current,
      activeJobs: [],
    });
  }, [startProgressUpdates]);

  const stop = useCallback(async () => {
    if (!workerRef.current) return;
    await workerRef.current.stop();
    workerRef.current = null;
    stopProgressUpdates();
    activeJobsRef.current.clear();
    setState((prev) => ({
      ...prev,
      running: false,
      activeJobs: [],
    }));
  }, [stopProgressUpdates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.stop();
      stopProgressUpdates();
    };
  }, [stopProgressUpdates]);

  return { ...state, start, stop };
}

function simulateWork(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, durationMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
