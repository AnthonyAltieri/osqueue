import type { StorageBackend, QueueState } from "@osqueue/types";
import {
  BrokerLeadershipError,
  CASConflictError,
  QUEUE_STATE_KEY,
  DEFAULT_BROKER_HEARTBEAT_TIMEOUT_MS,
  wrapUnknownError,
} from "@osqueue/types";
import { emptyState, registerBroker } from "./state.js";

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
    const result = await this.storage.read(this.stateKey);

    if (!result) {
      // No state file yet — create one with us as broker
      try {
        const state = registerBroker(emptyState(), this.brokerAddress, now);
        await this.storage.createIfNotExists(
          this.stateKey,
          encoder.encode(JSON.stringify(state)),
        );
        return { status: "elected" };
      } catch (err) {
        if (err instanceof CASConflictError) {
          return { status: "conflict" };
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
        return { status: "already_leader" };
      }
      // Our own heartbeat went stale — re-register
    }

    // If another broker is alive, back off
    if (
      state.broker !== null &&
      state.broker !== this.brokerAddress &&
      now - state.brokerHeartbeat <= this.heartbeatTimeoutMs
    ) {
      return { status: "other_leader", leader: state.broker };
    }

    // Broker is stale or null — try to take over
    const newState = registerBroker(state, this.brokerAddress, now);
    try {
      await this.storage.write(
        this.stateKey,
        encoder.encode(JSON.stringify(newState)),
        result.version,
      );
      return { status: "elected" };
    } catch (err) {
      if (err instanceof CASConflictError) {
        return { status: "conflict" };
      }
      throw wrapUnknownError(
        err,
        (message, cause) => new BrokerLeadershipError(message, { cause }),
      );
    }
  }

  /**
   * Check if we're still the broker.
   * Returns false if someone else has taken over (triggers self-demotion).
   */
  async checkLeadership(): Promise<boolean> {
    const result = await this.storage.read(this.stateKey);
    if (!result) return false;

    const state = JSON.parse(decoder.decode(result.data)) as QueueState;
    return state.broker === this.brokerAddress;
  }
}
