// 単一プロセスの試作。停止はCtrl+C。常駐登録・自動再起動・有料API通信は行わない。
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { AIService, createProvider } from "../ai/providers.js";
import { createNetwork } from "./network.js";
import { createApp } from "./app.js";
import { Repository } from "./db.js";
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const dataDir = resolve(appRoot, "data");
mkdirSync(dataDir, { recursive: true });
const repo = new Repository(resolve(dataDir, "kondate.sqlite"));
let provider;
try {
  provider = createProvider();
} catch {
  console.error("AI_PROVIDERが無効です。起動を停止しました。");
  repo.close();
  process.exit(1);
}
const host = process.env.HOST ?? "127.0.0.1",
  port = Number(process.env.PORT ?? 3000);
const network = createNetwork(host, port);
const app = createApp(repo, new AIService(provider), dataDir, network);
const dev = process.env.KONDATE_DEV === "1";
let vite:
  Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | undefined;
if (dev) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root: appRoot,
    server: { middlewareMode: true },
    appType: "spa",
  });
} else {
  app.get("*", serveStatic({ root: resolve(appRoot, "dist/client") }));
  app.get(
    "*",
    serveStatic({ path: resolve(appRoot, "dist/client/index.html") }),
  );
}
const listener = getRequestListener(app.fetch);
const server = createServer((req, res) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  if (new URL(req.url ?? "/", "http://localhost").searchParams.has("k"))
    res.setHeader("Cache-Control", "no-store");
  if (vite && !req.url?.startsWith("/api/"))
    vite.middlewares(req, res, () => listener(req, res));
  else listener(req, res);
});

server.listen(port, host, () => {
  console.log(
    `kondate: http://${host}:${port} / AI: ${provider.name} / 架空データの試作`,
  );
  // リダイレクト先のログには起動鍵を出さない。QR以外は対話端末だけ。
  if (network.key && process.stdout.isTTY && network.joinUrl)
    console.log(`会場接続: ${network.joinUrl}`);
});
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await vite?.close();
  repo.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
