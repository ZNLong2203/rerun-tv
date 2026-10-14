/**
 * Start the server: HTTP API, media, the phone companion, and a WebSocket
 * endpoint at /ws?room=CODE&role=tv|phone for pairing. With HTTPS=1 the same
 * app is also served over HTTPS (self-signed) for phones on the LAN.
 */

import { mkdirSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { isPairCode, type Role } from "@rerun/core";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { createApp, lanAddress } from "./app.js";
import { createAsker } from "./ask.js";
import { Catalog } from "./catalog.js";
import { ensureDevCert } from "./devcert.js";
import { Rooms } from "./rooms.js";
import { seedDemo } from "./seed.js";
import { Store } from "./store.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  process.loadEnvFile(join(ROOT, ".env.local"));
} catch {
  // No .env.local: use the environment as it is.
}

const port = Number(process.env.PORT ?? 8787);
const https = process.env.HTTPS === "1";
const httpsPort = Number(process.env.HTTPS_PORT ?? port + 1);
const lan = lanAddress();
const dataDir = process.env.DATA_DIR ?? join(ROOT, ".data");
mkdirSync(dataDir, { recursive: true });

const store = new Store(join(dataDir, "rerun.db"));
const catalog = new Catalog(join(ROOT, "content"), process.env.MEDIA_DIR ?? join(ROOT, "media"));
const rooms = new Rooms();
if (process.env.SEED_DEMO !== "false") seedDemo(store, catalog);

const app = createApp({
  store,
  catalog,
  rooms,
  asker: createAsker(),
  phoneDir: join(ROOT, "apps", "phone", "dist"),
  // An empty PUBLIC_URL= line in .env.local means "not set".
  publicUrl: process.env.PUBLIC_URL?.trim() || undefined,
  phoneUrl: https ? `https://${lan ?? "localhost"}:${httpsPort}` : undefined,
  debugRooms: process.env.DEBUG_ROOMS === "1",
  stillVideo: process.env.STILL_VIDEO === "1",
  frameCacheDir: join(ROOT, ".cache", "frames"),
  port,
});

const root = new Hono();
if (process.env.LOG_REQUESTS !== "off") root.use(logger());
if (process.env.DEBUG_MEDIA) {
  root.use("/media/*", async (c, next) => {
    console.log("media request", c.req.method, c.req.url, JSON.stringify(Object.fromEntries(c.req.raw.headers)));
    await next();
  });
}
root.route("/", app);

const server = serve({ fetch: root.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`Rerun server on http://localhost:${port}${lan ? `  (LAN http://${lan}:${port})` : ""}`);
  console.log(`titles: ${catalog.list().map((t) => `${t.meta.id}${t.track ? "" : " (no track)"}${t.videoPath ? "" : " (no video)"}`).join(", ") || "none"}`);
});

const wss = new WebSocketServer({ noServer: true });
function acceptRooms(listener: Server) {
  listener.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const room = (url.searchParams.get("room") ?? "").toUpperCase();
    const role = url.searchParams.get("role") as Role | null;
    if (url.pathname !== "/ws" || !isPairCode(room) || (role !== "tv" && role !== "phone") || !rooms.has(room)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      rooms.join(room, role, ws);
      ws.on("message", (data) => rooms.relay(room, role, ws, data.toString()));
      ws.on("close", () => rooms.leave(room, ws));
    });
  });
}
acceptRooms(server as Server);

if (https) {
  const secure = serve(
    {
      fetch: root.fetch,
      port: httpsPort,
      hostname: "0.0.0.0",
      createServer: createHttpsServer,
      serverOptions: ensureDevCert(join(dataDir, "certs"), lan ? [lan] : []),
    },
    () => console.log(`phones: https://${lan ?? "localhost"}:${httpsPort}/m/  (self-signed: accept the warning once)`),
  );
  acceptRooms(secure as Server);
}

// Keep connections honest behind proxies that drop idle sockets.
setInterval(() => {
  for (const ws of wss.clients) ws.ping();
}, 25_000).unref();
