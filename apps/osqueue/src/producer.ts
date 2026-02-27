import { OsqueueClient } from "@osqueue/client";
import { env } from "./env.js";
import { registry } from "./registry.js";
import { sleep } from "./utils/sleep.js";

const client = new OsqueueClient({ brokerUrl: env.BROKER_URL }, registry);

let running = true;
process.on("SIGINT", () => {
  console.log("Stopping producer...");
  running = false;
});

const subjects = ["Hello!", "Weekly update", "Meeting notes", "Invoice #42"];
const formats = ["pdf", "csv"] as const;
let counter = 0;

while (running) {
  counter++;

  if (counter % 2 === 1) {
    const jobId = await client.submitJob("email:send", {
      to: `user${counter}@example.com`,
      subject: subjects[counter % subjects.length]!,
      body: `This is message #${counter}`,
    });
    console.log(`Submitted email:send job ${jobId}`);
  } else {
    const jobId = await client.submitJob("report:generate", {
      reportId: `rpt-${counter}`,
      format: formats[counter % formats.length]!,
    });
    console.log(`Submitted report:generate job ${jobId}`);
  }

  await sleep(2000);
}
