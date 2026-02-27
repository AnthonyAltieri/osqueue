import { OsqueueClient } from "@osqueue/client";
import { Worker } from "@osqueue/worker";
import { env } from "./env.js";
import { registry } from "./registry.js";
import { sleep } from "./utils/sleep.js";

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

process.on("SIGINT", () => {
  console.log("Stopping worker...");
  worker.stop().then(() => process.exit(0));
});
