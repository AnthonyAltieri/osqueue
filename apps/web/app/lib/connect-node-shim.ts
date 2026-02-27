import { TransportConfigError } from "@osqueue/types";

// Shim for @connectrpc/connect-node in browser builds.
// The OsqueueClient dynamically requires connect-node when no transport is provided.
// In the browser we always provide a connect-web transport, so this is never called.
export function createConnectTransport(): never {
  throw new TransportConfigError(
    "@connectrpc/connect-node is not available in the browser",
  );
}
