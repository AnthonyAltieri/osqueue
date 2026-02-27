import { createConnectTransport } from "@connectrpc/connect-web";
import { OsqueueClient } from "@osqueue/client";
import { z } from "zod";

export const registry = {
  "email:send": z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  "report:generate": z.object({
    reportId: z.string(),
    format: z.enum(["pdf", "csv"]),
  }),
};

let client: OsqueueClient<typeof registry> | null = null;

export function getBrokerUrl(): string {
  if (typeof window === "undefined") return "";
  return (
    (import.meta as any).env?.VITE_BROKER_URL || "http://localhost:8080"
  );
}

export function getQueueClient(): OsqueueClient<typeof registry> {
  if (!client) {
    const transport = createConnectTransport({ baseUrl: getBrokerUrl() });
    client = new OsqueueClient({ transport }, registry);
  }
  return client;
}

export function resetQueueClient(): void {
  client = null;
}
