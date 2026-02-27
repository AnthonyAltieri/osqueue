import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  plugins: [
    tanstackStart({
      srcDirectory: "app",
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
      "@connectrpc/connect-node": resolve(
        __dirname,
        "app/lib/connect-node-shim.ts",
      ),
    },
  },
});
