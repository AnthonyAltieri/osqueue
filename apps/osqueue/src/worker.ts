import { OsqueueClient } from "@osqueue/client";
import { Worker } from "@osqueue/worker";
import { initTelemetry, shutdownTelemetry } from "@osqueue/otel";
import { env } from "./env.js";
import { registry } from "./registry.js";
import { sleep } from "./utils/sleep.js";

initTelemetry({
  enabled: env.OTEL_ENABLED,
  serviceName: "osqueue-worker",
});

const client = new OsqueueClient({ brokerUrl: env.BROKER_URL }, registry);

const worker = new Worker({
  client,
  handlers: {
    "email:send": async (payload) => {
      console.log(`Sending email to ${payload.to}: "${payload.subject}"`);
      await sleep(500);
      console.log(`Email sent to ${payload.to}`);
    },
    "report:generate": async (payload) => {
      console.log(`Generating ${payload.format} report ${payload.reportId}...`);
      await sleep(1000);
      console.log(`Report ${payload.reportId} complete`);
    },
  },
});

worker.start();
console.log("Worker started, polling for jobs...");

process.on("SIGINT", async () => {
  console.log("Stopping worker...");
  await worker.stop();
  await shutdownTelemetry();
  process.exit(0);
});
