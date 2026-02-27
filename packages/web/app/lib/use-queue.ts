import { useState, useEffect, useRef, useCallback } from "react";
import type { ListJobsResponse, JobInfo } from "@osqueue/proto";
import { getQueueClient } from "./queue-client";

export interface ActivityEvent {
  id: string;
  timestamp: number;
  message: string;
  type: "submitted" | "claimed" | "completed" | "error";
}

export interface QueueData {
  jobs: JobInfo[];
  total: number;
  unclaimed: number;
  inProgress: number;
  completedTotal: number;
  brokerAddress: string;
  connected: boolean;
  activity: ActivityEvent[];
}

const MAX_ACTIVITY = 100;

export function useQueue(pollMs = 500): QueueData {
  const [data, setData] = useState<QueueData>({
    jobs: [],
    total: 0,
    unclaimed: 0,
    inProgress: 0,
    completedTotal: 0,
    brokerAddress: "",
    connected: false,
    activity: [],
  });

  const prevJobsRef = useRef<Map<string, string>>(new Map());
  const prevTotalRef = useRef(0);
  const activityRef = useRef<ActivityEvent[]>([]);
  const failCountRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const client = getQueueClient();
      const res: ListJobsResponse = await client.listJobs();

      const currentJobs = new Map<string, string>();
      for (const job of res.jobs) {
        currentJobs.set(job.id, job.status);
      }

      const prev = prevJobsRef.current;
      const events: ActivityEvent[] = [];
      const now = Date.now();

      // Detect new jobs (in current but not in previous)
      for (const job of res.jobs) {
        if (!prev.has(job.id)) {
          events.push({
            id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
            timestamp: now,
            message: `Job ${job.id.slice(0, 8)} submitted${job.type ? ` (${job.type})` : ""}`,
            type: "submitted",
          });
        }
      }

      // Detect status changes and completions
      for (const [id, prevStatus] of prev) {
        const currentStatus = currentJobs.get(id);
        if (!currentStatus) {
          // Job disappeared → completed
          events.push({
            id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
            timestamp: now,
            message: `Job ${id.slice(0, 8)} completed`,
            type: "completed",
          });
        } else if (prevStatus === "unclaimed" && currentStatus === "in_progress") {
          const job = res.jobs.find((j) => j.id === id);
          events.push({
            id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
            timestamp: now,
            message: `Job ${id.slice(0, 8)} claimed${job?.workerId ? ` by ${job.workerId.slice(0, 8)}` : ""}`,
            type: "claimed",
          });
        }
      }

      // Also detect completions via counter increase
      if (
        res.completedTotal > prevTotalRef.current &&
        events.filter((e) => e.type === "completed").length === 0 &&
        prevTotalRef.current > 0
      ) {
        const diff = res.completedTotal - prevTotalRef.current;
        for (let i = 0; i < diff; i++) {
          events.push({
            id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
            timestamp: now,
            message: "Job completed",
            type: "completed",
          });
        }
      }

      prevJobsRef.current = currentJobs;
      prevTotalRef.current = res.completedTotal;
      failCountRef.current = 0;

      if (events.length > 0) {
        activityRef.current = [...events, ...activityRef.current].slice(
          0,
          MAX_ACTIVITY,
        );
      }

      setData({
        jobs: res.jobs,
        total: res.total,
        unclaimed: res.unclaimed,
        inProgress: res.inProgress,
        completedTotal: res.completedTotal,
        brokerAddress: res.brokerAddress,
        connected: true,
        activity: activityRef.current,
      });
    } catch (err) {
      failCountRef.current++;
      if (failCountRef.current >= 3) {
        setData((prev) => ({ ...prev, connected: false }));
      }
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, pollMs);
    return () => clearInterval(id);
  }, [poll, pollMs]);

  return data;
}
