import { BrokerServer } from "@osqueue/broker";
import { env } from "./env.js";
import { createStorage } from "./storage.js";

const storage = createStorage();

const server = new BrokerServer({
  storage,
  host: env.BROKER_HOST,
  port: env.BROKER_PORT,
});

await server.start();
console.log(`Broker listening on ${server.address}`);

function shutdown() {
  console.log("Shutting down broker...");
  server.stop().then(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
