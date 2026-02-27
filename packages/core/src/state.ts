import type {
  QueueState,
  Job,
  Mutation,
  MutationResult,
  JobId,
  WorkerId,
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
    completedTotal: 0,
  };
}

/** Generate a UUID v4 using crypto */
function uuid(): JobId {
  return crypto.randomUUID() as JobId;
}

function matchesJobTypeFilter(job: Job, jobTypes?: string[]): boolean {
  if (!jobTypes || jobTypes.length === 0) {
    return true;
  }

  if (!job.type) {
    return false;
  }

  return jobTypes.includes(job.type);
}

/** Enqueue new jobs into the state */
export function enqueueJobs(
  state: QueueState,
  payloads: Array<{ payload: unknown; jobType?: string; maxAttempts?: number }>,
  now: number = Date.now(),
): { state: QueueState; ids: JobId[] } {
  const ids: JobId[] = [];
  const newJobs: Job[] = payloads.map((p) => {
    const id = uuid();
    ids.push(id);
    return {
      id,
      status: "unclaimed" as const,
      payload: p.payload,
      type: p.jobType,
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
  workerId: WorkerId,
  now: number = Date.now(),
  jobTypes?: string[],
): { state: QueueState; claimed: { id: JobId; payload: unknown; type?: string } | null } {
  const idx = state.jobs.findIndex(
    (job) => job.status === "unclaimed" && matchesJobTypeFilter(job, jobTypes),
  );
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
    claimed: { id: job.id, payload: job.payload, type: job.type },
  };
}

/** Update heartbeat for an in-progress job */
export function heartbeatJob(
  state: QueueState,
  jobId: JobId,
  workerId: WorkerId,
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
  jobId: JobId,
  workerId: WorkerId,
): QueueState {
  const idx = state.jobs.findIndex(
    (j) => j.id === jobId && j.workerId === workerId && j.status === "in_progress",
  );
  if (idx === -1) return state;

  const jobs = state.jobs.filter((_, i) => i !== idx);
  return { ...state, jobs, completedTotal: (state.completedTotal ?? 0) + 1 };
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
        mutation.jobTypes,
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
