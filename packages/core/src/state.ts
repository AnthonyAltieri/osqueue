import type {
  QueueState,
  Job,
  Mutation,
  MutationResult,
} from "@osqueue/types";
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
} from "@osqueue/types";

/** Create an empty initial queue state */
export function emptyState(): QueueState {
  return {
    broker: null,
    brokerHeartbeat: 0,
    jobs: [],
  };
}

/** Generate a UUID v4 using crypto */
function uuid(): string {
  return crypto.randomUUID();
}

/** Enqueue new jobs into the state */
export function enqueueJobs(
  state: QueueState,
  payloads: Array<{ payload: unknown; maxAttempts?: number }>,
  now: number = Date.now(),
): { state: QueueState; ids: string[] } {
  const ids: string[] = [];
  const newJobs: Job[] = payloads.map((p) => {
    const id = uuid();
    ids.push(id);
    return {
      id,
      status: "unclaimed" as const,
      payload: p.payload,
      createdAt: now,
      attempts: 0,
      maxAttempts: p.maxAttempts,
    };
  });
  return {
    state: { ...state, jobs: [...state.jobs, ...newJobs] },
    ids,
  };
}

/** Claim the first unclaimed job for a worker */
export function claimJob(
  state: QueueState,
  workerId: string,
  now: number = Date.now(),
): { state: QueueState; claimed: { id: string; payload: unknown } | null } {
  const idx = state.jobs.findIndex((j) => j.status === "unclaimed");
  if (idx === -1) {
    return { state, claimed: null };
  }

  const job = state.jobs[idx]!;
  const updatedJob: Job = {
    ...job,
    status: "in_progress",
    workerId,
    heartbeat: now,
    attempts: job.attempts + 1,
  };

  const jobs = [...state.jobs];
  jobs[idx] = updatedJob;
  return {
    state: { ...state, jobs },
    claimed: { id: job.id, payload: job.payload },
  };
}

/** Update heartbeat for an in-progress job */
export function heartbeatJob(
  state: QueueState,
  jobId: string,
  workerId: string,
  now: number = Date.now(),
): QueueState {
  const idx = state.jobs.findIndex(
    (j) => j.id === jobId && j.workerId === workerId && j.status === "in_progress",
  );
  if (idx === -1) return state;

  const jobs = [...state.jobs];
  jobs[idx] = { ...jobs[idx]!, heartbeat: now };
  return { ...state, jobs };
}

/** Complete a job (remove it from the array) */
export function completeJob(
  state: QueueState,
  jobId: string,
  workerId: string,
): QueueState {
  const idx = state.jobs.findIndex(
    (j) => j.id === jobId && j.workerId === workerId && j.status === "in_progress",
  );
  if (idx === -1) return state;

  const jobs = state.jobs.filter((_, i) => i !== idx);
  return { ...state, jobs };
}

/** Expire stale heartbeats: reset timed-out in_progress jobs to unclaimed or remove if max attempts exceeded */
export function expireHeartbeats(
  state: QueueState,
  now: number = Date.now(),
  timeoutMs: number = DEFAULT_HEARTBEAT_TIMEOUT_MS,
): QueueState {
  const jobs = state.jobs.reduce<Job[]>((acc, job) => {
    if (
      job.status === "in_progress" &&
      job.heartbeat !== undefined &&
      now - job.heartbeat > timeoutMs
    ) {
      const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      if (job.attempts >= maxAttempts) {
        // Drop the job — exceeded max attempts
        return acc;
      }
      // Reset to unclaimed for retry
      acc.push({
        ...job,
        status: "unclaimed",
        workerId: undefined,
        heartbeat: undefined,
      });
    } else {
      acc.push(job);
    }
    return acc;
  }, []);

  return { ...state, jobs };
}

/** Register or update broker address and heartbeat */
export function registerBroker(
  state: QueueState,
  brokerAddress: string,
  timestamp: number,
): QueueState {
  return {
    ...state,
    broker: brokerAddress,
    brokerHeartbeat: timestamp,
  };
}

/** Apply a single mutation to the state */
export function applyMutation(
  state: QueueState,
  mutation: Mutation,
  now: number = Date.now(),
): { state: QueueState; result: MutationResult } {
  switch (mutation.type) {
    case "enqueue": {
      const { state: newState, ids } = enqueueJobs(state, mutation.jobs, now);
      return { state: newState, result: { enqueuedIds: ids } };
    }
    case "claim": {
      const { state: newState, claimed } = claimJob(
        state,
        mutation.workerId,
        now,
      );
      return { state: newState, result: { claimedJob: claimed } };
    }
    case "heartbeat": {
      const newState = heartbeatJob(
        state,
        mutation.jobId,
        mutation.workerId,
        now,
      );
      return { state: newState, result: {} };
    }
    case "complete": {
      const newState = completeJob(state, mutation.jobId, mutation.workerId);
      return { state: newState, result: {} };
    }
    case "register_broker": {
      const newState = registerBroker(
        state,
        mutation.brokerAddress,
        mutation.timestamp,
      );
      return { state: newState, result: {} };
    }
  }
}
