// Node.js wrapper for TanStack Start dashboard.
// Serves static files from dist/client and delegates everything else to the SSR handler.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";

const DIST_CLIENT = "/app/apps/web/dist/client";
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const { default: server } = await import("/app/apps/web/dist/server/server.js");
const port = parseInt(process.env.PORT || "3001");

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  // Try static file first
  const filePath = join(DIST_CLIENT, url.pathname);
  if (url.pathname !== "/" && existsSync(filePath)) {
    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
      return;
    } catch {}
  }

  // SSR handler
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const fetchReq = new Request(url.href, {
      method: req.method,
      headers,
    });
    const fetchRes = await server.fetch(fetchReq);
    res.writeHead(fetchRes.status, Object.fromEntries(fetchRes.headers.entries()));
    const body = await fetchRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    console.error("SSR error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Dashboard listening on :${port}`);
});
