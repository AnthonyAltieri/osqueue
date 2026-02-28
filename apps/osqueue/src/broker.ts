import { BrokerServer } from "@osqueue/broker";
import { env } from "./env.js";
import { createStorage } from "./storage.js";

const storage = createStorage();

const server = new BrokerServer({
  storage,
  host: env.BROKER_HOST,
  port: env.BROKER_PORT,
  groupCommitIntervalMs: env.GROUP_COMMIT_INTERVAL_MS,
  heartbeatIntervalMs: env.BROKER_HEARTBEAT_INTERVAL_MS,
});

await server.start();
console.log(`Broker listening on ${server.address}`);

function shutdown() {
  console.log("Shutting down broker...");
  server.stop().then(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
