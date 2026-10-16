import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { getRequestListener } from "@hono/node-server";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { createApp } from "../src/server/app.js";
import { createNetwork, keyMatches } from "../src/server/network.js";
import { Repository } from "../src/server/db.js";
import { AIService, ScriptedProvider } from "../src/ai/providers.js";

const text = "今夜は肉じゃが、3人分、2,000円以内";
async function fixture(host = "127.0.0.1") {
  const parent = resolve("data/tests");
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, "session-"));
  const repo = new Repository(":memory:");
  const network = createNetwork(host, 3000);
  const app = createApp(
    repo,
    new AIService(new ScriptedProvider()),
    dir,
    network,
  );
  return {
    app,
    network,
    repo,
    close: async () => {
      repo.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
const postOptions = (body: unknown, key?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "X-Demo-Key": key } : {}),
  },
  body: JSON.stringify(body),
});

test("session/currentは未依頼・最新の依頼・resetを保持し、再計算で現在依頼を上書きしない", async () => {
  const f = await fixture();
  try {
    const get = async () =>
      (await f.app.request("/api/session/current")).json();
    assert.equal((await get()).plan, null);
    const first = await (
      await f.app.request("/api/plan", postOptions({ text }))
    ).json();
    assert.deepEqual((await get()).plan, first);
    await f.app.request(
      "/api/plan",
      postOptions({ text: "カレー、4人分、2,500円以内" }),
    );
    await f.app.request(
      "/api/plan/recalculate",
      postOptions({ intent: first.intent, recipe: first.recipe }),
    );
    assert.equal((await get()).plan.intent.dish, "カレー");
    await f.app.request("/api/reset", postOptions({}));
    assert.equal((await get()).plan, null);
  } finally {
    await f.close();
  }
});

test("LAN時の全書込APIは鍵なし・誤った鍵を拒否し、正しい鍵と接続Cookieを認める", async () => {
  const f = await fixture("0.0.0.0");
  try {
    const endpoints = [
      "/api/plan",
      "/api/plan/recalculate",
      "/api/captures",
      "/api/captures/missing/confirm",
      "/api/reset",
      "/api/session/connect",
    ];
    for (const path of endpoints) {
      assert.equal(
        (await f.app.request(path, postOptions({}))).status,
        403,
        `${path} missing`,
      );
      assert.equal(
        (await f.app.request(path, postOptions({}, "incorrect"))).status,
        403,
        `${path} wrong`,
      );
      // 同じ文字数でもバイト長が違う入力は403。
      assert.equal(
        (
          await f.app.request(
            path,
            postOptions({}, "é".repeat(f.network.key!.length)),
          )
        ).status,
        403,
        `${path} unicode`,
      );
      const res = await f.app.request(
        path,
        postOptions(path === "/api/plan" ? { text } : {}, f.network.key),
      );
      assert.notEqual(res.status, 403, `${path} authenticated`);
    }
    const connect = await f.app.request(
      "/api/session/connect",
      postOptions({}, f.network.key),
    );
    const cookie = connect.headers.get("Set-Cookie")!;
    assert.ok(
      cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict"),
    );
    assert.equal(
      (
        await f.app.request("/api/reset", {
          ...postOptions({}),
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie.split(";")[0],
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.app.request("/api/session/qr")).status,
      403,
      "接続元不明ではQRに鍵を配らない",
    );
    const imagePath =
      "/api/captures/00000000-0000-4000-8000-000000000000/image";
    assert.equal(
      (await f.app.request(imagePath)).status,
      403,
      "LAN公開時は鍵なしで撮影画像を見せない",
    );
    assert.notEqual(
      (
        await f.app.request(imagePath, {
          headers: { Cookie: cookie.split(";")[0] },
        })
      ).status,
      403,
      "鍵のcookieがあれば画像の経路に届く",
    );
    const config = JSON.stringify(
      await (await f.app.request("/api/config")).json(),
    );
    assert.equal(config.includes(f.network.key!), false);
    assert.equal(keyMatches(undefined, f.network.key), false);
    assert.equal(keyMatches(f.network.key, f.network.key), true);
    assert.equal(
      keyMatches(createNetwork("0.0.0.0").key, f.network.key),
      false,
      "起動ごとに別の鍵",
    );
    assert.throws(() => createNetwork("192.0.2.1"), /HOST/);
  } finally {
    await f.close();
  }
});

test("127.0.0.1時は鍵なしで書込可能、QRをローカル生成する", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.app.request("/api/plan", postOptions({ text }))).status,
      200,
    );
    const qr = await f.app.request("/api/session/qr");
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get("Content-Type"), "image/png");
    assert.equal(
      (await sharp(Buffer.from(await qr.arrayBuffer())).metadata()).width,
      192,
    );
    assert.equal(
      (await f.app.request("/api/reset", postOptions({}))).status,
      200,
    );
  } finally {
    await f.close();
  }
});

test("実HTTPのSSEでplan・組み替え・captureの全イベントと旧新の額・順位を順に受信する", async () => {
  const f = await fixture();
  const server = createServer(getRequestListener(f.app.fetch));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(base + "/api/events", {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
    });
    reader = response.body!.getReader();
    let buffer = "";
    const decoder = new TextDecoder();
    async function nextEvent(kind: string) {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (block.includes(`event: ${kind}\n`))
            return JSON.parse(
              block
                .split("\n")
                .find((s) => s.startsWith("data: "))!
                .slice(6),
            );
        } else {
          const read = await reader!.read();
          if (read.done) throw new Error("SSE ended");
          buffer += decoder.decode(read.value, { stream: true });
        }
      }
    }
    await nextEvent("session");
    await fetch(base + "/api/plan", postOptions({ text }));
    const planEvent = await nextEvent("plan");
    assert.equal(planEvent.plan.stores[0].store.id, "s1");
    assert.equal(planEvent.event.kind, "plan");
    assert.equal((await nextEvent("suggestion")).event.kind, "swap");
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("storeId", "s2");
    form.set(
      "image",
      new Blob([new Uint8Array(image)], { type: "image/png" }),
      "label.png",
    );
    const capture = await (
      await fetch(base + "/api/captures", { method: "POST", body: form })
    ).json();
    await fetch(
      base + `/api/captures/${capture.id}/confirm`,
      postOptions({ candidate: { ...capture.candidates[0], stock: "in" } }),
    );
    const event = await nextEvent("capture");
    assert.equal(event.storeId, "s2");
    assert.equal(event.product.name, "豚こま肉");
    assert.equal(event.product.priceMinor, 18000);
    assert.deepEqual(
      [event.oldTotal, event.newTotal, event.oldRank, event.newRank],
      [96000, 78000, 2, 1],
    );
    assert.equal(event.plan.stores[0].store.id, "s2");
    assert.match(event.event.text, /2位 → 1位/);
    assert.deepEqual(
      (await (await fetch(base + "/api/session/current")).json()).plan,
      event.plan,
    );
  } finally {
    abort.abort();
    await reader?.cancel().catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.close();
  }
});

test("LAN設定をループバックの実HTTPで隔離確認：QR・Cookie接続・写真反映・別Origin拒否", async () => {
  const f = await fixture("0.0.0.0");
  const server = createServer(getRequestListener(f.app.fetch));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal(
      (await fetch(base + "/api/session/qr")).status,
      200,
      "実接続元がloopbackならQRを取得できる",
    );
    const connected = await fetch(
      base + "/api/session/connect",
      postOptions({}, f.network.key),
    );
    const cookie = connected.headers.get("set-cookie")!.split(";")[0];
    const jsonOptions = (body: unknown) => ({
      ...postOptions(body),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: base,
      },
    });
    assert.equal(
      (await fetch(base + "/api/plan", jsonOptions({ text }))).status,
      200,
    );
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("storeId", "s2");
    form.set(
      "image",
      new Blob([new Uint8Array(image)], { type: "image/png" }),
      "label.png",
    );
    const captured = await fetch(base + "/api/captures", {
      method: "POST",
      headers: { Cookie: cookie, Origin: base },
      body: form,
    });
    assert.equal(captured.status, 201);
    const capture = await captured.json();
    const result = await fetch(
      base + `/api/captures/${capture.id}/confirm`,
      jsonOptions({ candidate: { ...capture.candidates[0], stock: "in" } }),
    );
    assert.equal(result.status, 200);
    const current = await (await fetch(base + "/api/session/current")).json();
    assert.equal(current.plan.stores[0].best.totalMinor, 78000);
    assert.equal(
      JSON.stringify(current).includes(f.network.key!),
      false,
      "現在依頼に鍵を含めない",
    );
    const cross = await fetch(base + "/api/reset", {
      ...jsonOptions({}),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://untrusted.invalid",
      },
    });
    assert.equal(cross.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.close();
  }
});
