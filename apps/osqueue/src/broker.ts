import { BrokerServer } from "@osqueue/broker";
import { initTelemetry, shutdownTelemetry } from "@osqueue/otel";
import { env } from "./env.js";
import { createStorage } from "./storage.js";

initTelemetry({
  enabled: env.OTEL_ENABLED,
  serviceName: "osqueue-broker",
});

const storage = createStorage();

const server = new BrokerServer({
  storage,
  host: env.BROKER_HOST,
  port: env.BROKER_PORT,
  groupCommitIntervalMs: env.GROUP_COMMIT_INTERVAL_MS,
  heartbeatIntervalMs: env.BROKER_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs: env.BROKER_HEARTBEAT_TIMEOUT_MS,
});

await server.start();
console.log(`Broker listening on ${server.address}`);

async function shutdown() {
  console.log("Shutting down broker...");
  await server.stop();
  await shutdownTelemetry();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
