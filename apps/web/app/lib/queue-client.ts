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

type BrowserTransportKind = "connect" | "rest" | "ws";

let client: OsqueueClient<typeof registry> | null = null;

export function getBrokerUrl(): string {
  if (typeof window === "undefined") return "";
  const envUrl = (import.meta as any).env?.VITE_BROKER_URL;
  if (envUrl) return envUrl;
  const hostname = window.location.hostname;
  // On a real domain: use api.{root domain} with matching protocol (Caddy handles TLS)
  // Strip "demo." prefix if present (dashboard lives on demo.domain.com, broker on api.domain.com)
  if (hostname !== "localhost" && !/^\d/.test(hostname)) {
    const rootDomain = hostname.replace(/^demo\./, "");
    return `${window.location.protocol}//api.${rootDomain}`;
  }
  // Local dev or raw IP: broker on port 8080
  return `http://${hostname}:8080`;
}

function getTransportKind(): BrowserTransportKind {
  const value = ((import.meta as any).env?.VITE_OSQUEUE_TRANSPORT ?? "connect") as string;
  if (value === "rest" || value === "ws") {
    return value;
  }
  return "connect";
}

export function getQueueClient(): OsqueueClient<typeof registry> {
  if (!client) {
    const brokerUrl = getBrokerUrl();
    const transportKind = getTransportKind();

    if (transportKind === "connect") {
      const transport = createConnectTransport({ baseUrl: brokerUrl });
      client = new OsqueueClient({ brokerUrl, transport }, registry);
    } else {
      client = new OsqueueClient(
        {
          brokerUrl,
          transport: { kind: transportKind },
        },
        registry,
      );
    }
  }

  return client;
}

export function resetQueueClient(): void {
  client = null;
}
