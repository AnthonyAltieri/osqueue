import type { StorageBackend, QueueState } from "@osqueue/types";
import {
  BrokerLeadershipError,
  CASConflictError,
  QUEUE_STATE_KEY,
  DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS,
  wrapUnknownError,
} from "@osqueue/types";
import {
  createTracer,
  withSpan,
  OSQUEUE_BROKER_ADDRESS,
  OSQUEUE_ELECTION_RESULT,
} from "@osqueue/otel";
import { emptyState, registerBroker } from "./state.js";

const tracer = createTracer("@osqueue/core");

export interface BrokerElectionOptions {
  storage: StorageBackend;
  /** This broker's address (host:port) */
  brokerAddress: string;
  /** Key for the queue state object (default: "queue.json") */
  stateKey?: string;
  /** How long before a broker heartbeat is considered stale (default: 10000ms) */
  heartbeatTimeoutMs?: number;
}

export type ElectionResult =
  | { status: "elected" }
  | { status: "already_leader" }
  | { status: "other_leader"; leader: string }
  | { status: "conflict" };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class BrokerElection {
  private storage: StorageBackend;
  private brokerAddress: string;
  private stateKey: string;
  private heartbeatTimeoutMs: number;

  constructor(options: BrokerElectionOptions) {
    this.storage = options.storage;
    this.brokerAddress = options.brokerAddress;
    this.stateKey = options.stateKey ?? QUEUE_STATE_KEY;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS;
  }

  /** Attempt to become the broker. */
  async tryElect(now: number = Date.now()): Promise<ElectionResult> {
    return withSpan(tracer, "election.tryElect", {
      [OSQUEUE_BROKER_ADDRESS]: this.brokerAddress,
    }, async (span) => {
      const result = await this.storage.read(this.stateKey);

      if (!result) {
        // No state file yet — create one with us as broker
        try {
          const state = registerBroker(emptyState(), this.brokerAddress, now);
          await this.storage.createIfNotExists(
            this.stateKey,
            encoder.encode(JSON.stringify(state)),
          );
          span.setAttribute(OSQUEUE_ELECTION_RESULT, "elected");
          return { status: "elected" as const };
        } catch (err) {
          if (err instanceof CASConflictError) {
            span.setAttribute(OSQUEUE_ELECTION_RESULT, "conflict");
            return { status: "conflict" as const };
          }
          throw wrapUnknownError(
            err,
            (message, cause) => new BrokerLeadershipError(message, { cause }),
          );
        }
      }

      const state = JSON.parse(decoder.decode(result.data)) as QueueState;

      // If we're already the broker and heartbeat is fresh, just update heartbeat
      if (state.broker === this.brokerAddress) {
        if (now - state.brokerHeartbeat <= this.heartbeatTimeoutMs) {
          span.setAttribute(OSQUEUE_ELECTION_RESULT, "already_leader");
          return { status: "already_leader" as const };
        }
        // Our own heartbeat went stale — re-register
      }

      // If another broker is alive, back off
      if (
        state.broker !== null &&
        state.broker !== this.brokerAddress &&
        now - state.brokerHeartbeat <= this.heartbeatTimeoutMs
      ) {
        span.setAttribute(OSQUEUE_ELECTION_RESULT, "other_leader");
        return { status: "other_leader" as const, leader: state.broker };
      }

      // Broker is stale or null — try to take over
      const newState = registerBroker(state, this.brokerAddress, now);
      try {
        await this.storage.write(
          this.stateKey,
          encoder.encode(JSON.stringify(newState)),
          result.version,
        );
        span.setAttribute(OSQUEUE_ELECTION_RESULT, "elected");
        return { status: "elected" as const };
      } catch (err) {
        if (err instanceof CASConflictError) {
          span.setAttribute(OSQUEUE_ELECTION_RESULT, "conflict");
          return { status: "conflict" as const };
        }
        throw wrapUnknownError(
          err,
          (message, cause) => new BrokerLeadershipError(message, { cause }),
        );
      }
    });
  }

  /**
   * Check if we're still the broker.
   * Returns false if someone else has taken over (triggers self-demotion).
   */
  async checkLeadership(): Promise<boolean> {
    return withSpan(tracer, "election.checkLeadership", {
      [OSQUEUE_BROKER_ADDRESS]: this.brokerAddress,
    }, async (span) => {
      const result = await this.storage.read(this.stateKey);
      if (!result) {
        span.setAttribute("osqueue.is_leader", false);
        return false;
      }

      const state = JSON.parse(decoder.decode(result.data)) as QueueState;
      const isLeader = state.broker === this.brokerAddress;
      span.setAttribute("osqueue.is_leader", isLeader);
      return isLeader;
    });
  }
}
