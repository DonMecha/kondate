import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { createApp } from "../src/server/app.js";
import { Repository } from "../src/server/db.js";
import { AIService, ScriptedProvider } from "../src/ai/providers.js";
test("APIの台本1〜5・確認前は価格不変・写真更新と順位・SQLite永続化・初期復元", async () => {
  const parent = resolve("data/tests");
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, "api-"));
  const repo = new Repository(join(dir, "test.sqlite"));
  const app = createApp(repo, new AIService(new ScriptedProvider()), dir);
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const response = await post("/api/plan", {
      text: "今夜は肉じゃが、3人分、2,000円以内",
    });
    assert.equal(response.status, 200);
    const plan = await response.json();
    assert.equal(plan.stores.length, 4);
    assert.equal(plan.stores[0].store.id, "s1");
    assert.equal(plan.stores[0].best.totalMinor, 89000);
    assert.equal(plan.stores[0].original.totalMinor, 128000);
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .withMetadata({ exif: { IFD0: { Artist: "fictional-fixture" } } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set("storeId", "s2");
    form.set(
      "image",
      new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
      "label.jpg",
    );
    const captureResponse = await app.request("/api/captures", {
      method: "POST",
      body: form,
    });
    assert.equal(captureResponse.status, 201);
    const capture = await captureResponse.json();
    assert.equal(capture.candidates[0].stock, "unknown");
    assert.equal(
      repo.products().find((p) => p.id === "s2-pork-komagire")!.priceMinor,
      36000,
    );
    const savedImage = await readFile(join(dir, "captures", capture.imagePath));
    assert.equal((await sharp(savedImage).metadata()).exif, undefined);
    assert.equal(
      (
        await post(`/api/captures/${capture.id}/confirm`, {
          candidate: { ...capture.candidates[0], tax: "unknown" },
        })
      ).status,
      400,
    );
    const confirmed = await post(`/api/captures/${capture.id}/confirm`, {
      candidate: { ...capture.candidates[0], stock: "in" },
    });
    assert.equal(confirmed.status, 200);
    const updated = await (
      await post("/api/plan/recalculate", {
        intent: plan.intent,
        recipe: plan.recipe,
      })
    ).json();
    assert.equal(updated.stores[0].store.id, "s2");
    assert.equal(updated.stores[0].best.totalMinor, 78000);
    assert.equal(
      updated.stores[0].best.lines.find((l: any) => l.key === "pork-komagire")
        .product.source,
      "photo",
    );
    const second = new Repository(join(dir, "test.sqlite"));
    assert.equal(
      second.products().find((p) => p.id === "s2-pork-komagire")!.priceMinor,
      18000,
    );
    second.close();
    const lines = updated.stores[0].best.lines.sort(
      (a: any, b: any) =>
        updated.stores[0].store.aisles.indexOf(a.aisle) -
        updated.stores[0].store.aisles.indexOf(b.aisle),
    );
    assert.equal(lines[0].aisle, "青果");
    assert.equal(
      (
        await post(`/api/captures/${capture.id}/confirm`, {
          candidate: capture.candidates[0],
        })
      ).status,
      409,
    );
    await post("/api/reset", {});
    assert.equal(
      repo.products().find((p) => p.id === "s2-pork-komagire")!.priceMinor,
      36000,
    );
    assert.equal(repo.capture(capture.id), undefined);
    const crossSite = await app.request("/api/reset", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(crossSite.status, 403);
    const invalid = new FormData();
    invalid.set("storeId", "s1");
    invalid.set(
      "image",
      new Blob(["not a png"], { type: "image/png" }),
      "fake.png",
    );
    assert.equal(
      (await app.request("/api/captures", { method: "POST", body: invalid }))
        .status,
      415,
    );
  } finally {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  }
});
