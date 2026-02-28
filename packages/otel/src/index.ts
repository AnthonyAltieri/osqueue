export { initTelemetry, shutdownTelemetry } from "./init.js";
export { resolveConfig } from "./config.js";
export type { OtelConfig } from "./config.js";
export { createTracer, withSpan } from "./tracer.js";
export {
  OSQUEUE_JOB_ID,
  OSQUEUE_JOB_TYPE,
  OSQUEUE_WORKER_ID,
  OSQUEUE_MUTATION_TYPE,
  OSQUEUE_BATCH_SIZE,
  OSQUEUE_CAS_ATTEMPT,
  OSQUEUE_STORAGE_KEY,
  OSQUEUE_STORAGE_BACKEND,
  OSQUEUE_STORAGE_OPERATION,
  OSQUEUE_BROKER_ADDRESS,
  OSQUEUE_ELECTION_RESULT,
  OSQUEUE_JOBS_CLAIMED,
  OSQUEUE_THROTTLE_DELAY_MS,
} from "./attributes.js";
