import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import { keyMatches, isLoopback, type NetworkConfig } from "./network.js";
import type { CaptureEvent, SessionSnapshot } from "../domain/session.js";
import { formatMoney } from "../domain/money.js";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { AIService } from "../ai/providers.js";
import {
  confirmSchema,
  planBodySchema,
  recalculateSchema,
} from "../ai/schemas.js";
import { planStores } from "../domain/planner.js";
import { withTax, yenToMinor } from "../domain/money.js";
import { Repository, stores, ingredients, recipes } from "./db.js";
import type { PlanResult, PriceCapture, Product } from "../domain/types.js";
const bad = (
  message: string,
  status: 400 | 404 | 409 | 413 | 415 | 422 = 400,
) => new HTTPException(status, { message });
export function createApp(
  repo: Repository,
  ai: AIService,
  dataDir: string,
  network: NetworkConfig = {
    host: "127.0.0.1",
    joinUrl: "http://127.0.0.1:3000/",
  },
) {
  const app = new Hono();
  type Message = { event: string; data: string; id?: string };
  const listeners = new Set<(message: Message) => void>();
  let session: SessionSnapshot = { plan: null, event: null, sequence: 0 };
  const emit = (event: string, data: unknown) => {
    for (const listener of listeners)
      listener({ event, data: JSON.stringify(data) });
  };
  const snapshot = (): SessionSnapshot => session;
  const capturesDir = join(dataDir, "captures");
  const notify = () => {
    emit("revision", { revision: repo.revision });
  };
  app.onError((error, c) =>
    error instanceof HTTPException
      ? c.json({ error: error.message }, error.status)
      : error instanceof z.ZodError
        ? c.json(
            {
              error:
                "入力の形式を確認してください。数値・税区分・特売期間が不正です。",
            },
            400,
          )
        : c.json(
            {
              error:
                "処理できませんでした。入力またはローカルAIの接続を確認してください。",
            },
            500,
          ),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    // 撮影画像には会場の人や物が写りうるので、LAN公開時は鍵のない閲覧を断る。
    if (
      c.req.method === "GET" &&
      c.req.path.startsWith("/api/captures/") &&
      !keyMatches(
        c.req.header("X-Demo-Key") ?? getCookie(c, "kondate-demo"),
        network.key,
      )
    )
      return c.json(
        { error: "会場のQRコードを読み直して接続してください" },
        403,
      );
    if (c.req.method === "POST") {
      if (
        !keyMatches(
          c.req.header("X-Demo-Key") ?? getCookie(c, "kondate-demo"),
          network.key,
        )
      )
        return c.json(
          { error: "会場のQRコードを読み直して接続してください" },
          403,
        );
      const origin = c.req.header("Origin");
      if (origin && origin !== new URL(c.req.url).origin)
        return c.json({ error: "同じ画面から操作してください" }, 403);
      if (
        c.req.path !== "/api/captures" &&
        !c.req.header("Content-Type")?.startsWith("application/json")
      )
        return c.json({ error: "JSONで送信してください" }, 415);
    }
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 9 * 1024 * 1024,
      onError: (c) => c.json({ error: "画像は8MB以下にしてください" }, 413),
    }),
  );
  app.post("/api/session/connect", (c) => {
    if (network.key)
      setCookie(c, "kondate-demo", network.key, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
      });
    return c.json({ ok: true });
  });
  app.get("/api/session/current", (c) => c.json(snapshot()));
  app.get("/api/session/qr", async (c) => {
    const remoteAddress = (
      c.env as
        { incoming?: { socket?: { remoteAddress?: string } } } | undefined
    )?.incoming?.socket?.remoteAddress;
    if (network.key && !isLoopback(remoteAddress))
      return c.json(
        { error: "QRはサーバー自身の投影画面だけに表示できます" },
        403,
      );
    if (!network.joinUrl)
      return c.json({ error: "LANのIPv4が見つかりません" }, 503);
    const png = await QRCode.toBuffer(network.joinUrl, {
      width: 192,
      margin: 2,
    });
    c.header("Content-Type", "image/png");
    return c.body(new Uint8Array(png));
  });
  app.get("/api/config", (c) =>
    c.json({
      provider: ai.provider.name,
      fictional: true,
      recipes: recipes.map(({ id, name }) => ({ id, name })),
      ingredients,
      revision: repo.revision,
      mapCenter: [
        Number(process.env.MAP_LAT ?? 35.681),
        Number(process.env.MAP_LNG ?? 139.767),
      ],
    }),
  );
  app.get("/api/stores", (c) => c.json(stores));
  app.get("/api/products", (c) =>
    c.json(
      repo
        .products()
        .filter(
          (p) =>
            !c.req.query("storeId") || p.storeId === c.req.query("storeId"),
        ),
    ),
  );
  function result(input: {
    intent: PlanResult["intent"];
    recipe: PlanResult["recipe"];
    warning?: string;
  }): PlanResult {
    return {
      ...input,
      stores: planStores(input.recipe, stores, repo.products(), input.intent),
      provider: ai.provider.name,
      revision: repo.revision,
    };
  }
  app.post("/api/plan", async (c) => {
    const { text } = planBodySchema.parse(await c.req.json());
    let interpreted;
    try {
      interpreted = await ai.interpret(text);
    } catch {
      throw bad(
        "依頼を解釈できません。登録済みの料理・1〜20人・予算を確認してください。",
        422,
      );
    }
    const plan = result(interpreted);
    const sequence = session.sequence + 1;
    session = {
      plan,
      sequence,
      event: {
        sequence,
        kind: "plan",
        text: `依頼を更新：${plan.intent.dish}、${plan.intent.servings}人分、${formatMoney(plan.intent.budgetMinor)}以内`,
      },
    };
    emit("plan", snapshot());
    const swap = plan.stores.find((p) => p.best.changes.length > 0);
    if (swap) {
      const sequence = session.sequence + 1;
      session = {
        ...session,
        sequence,
        event: {
          sequence,
          kind: "swap",
          text: `${swap.store.name}：${swap.best.reason}`,
        },
      };
      emit("suggestion", snapshot());
    }
    return c.json(plan);
  });
  app.post("/api/plan/recalculate", async (c) =>
    c.json(result(recalculateSchema.parse(await c.req.json()))),
  );
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let stopped = false;
      const pending: Message[] = [];
      let wake = () => {};
      const listener = (message: Message) => {
        pending.push(message);
        wake();
      };
      listeners.add(listener);
      const timer = setInterval(
        () =>
          listener({
            event: "revision",
            data: JSON.stringify({ revision: repo.revision }),
          }),
        15000,
      );
      stream.onAbort(() => {
        stopped = true;
        wake();
      });
      try {
        await stream.writeSSE({
          event: "revision",
          data: JSON.stringify({ revision: repo.revision }),
          id: String(repo.revision),
        });
        await stream.writeSSE({
          event: "session",
          data: JSON.stringify(snapshot()),
        });
        while (!stopped) {
          if (!pending.length)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          if (stopped) break;
          const message = pending.shift();
          if (message) await stream.writeSSE(message);
        }
      } finally {
        clearInterval(timer);
        listeners.delete(listener);
      }
    }),
  );
  app.post("/api/captures", async (c) => {
    const form = await c.req.formData(),
      file = form.get("image");
    const storeId = z.enum(["s1", "s2", "s3", "s4"]).parse(form.get("storeId"));
    if (!(file instanceof File) || !file.size)
      throw bad("画像を選択してください");
    if (file.size > 8 * 1024 * 1024)
      throw bad("画像は8MB以下にしてください", 413);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw bad("JPEG・PNG・WebPの画像を選んでください", 415);
    let image: Buffer;
    try {
      const input = sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 20_000_000,
        animated: false,
      });
      const meta = await input.metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
        (meta.pages ?? 1) > 1
      )
        throw new Error("format");
      // 再エンコードでEXIF/GPSを除去。元画像はディスクに保存しない。
      image = await input
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw bad("画像を読み込めません。形式と大きさを確認してください", 415);
    }
    const id = randomUUID(),
      revision = repo.revision;
    await mkdir(capturesDir, { recursive: true });
    const imagePath = join(capturesDir, `${id}.png`);
    await writeFile(imagePath, image, { mode: 0o600 });
    const extracted = await ai.readCapture(image);
    if (repo.revision !== revision) {
      await unlink(imagePath).catch(() => {});
      throw bad(
        "読み取り中にデータが更新されました。もう一度取り込んでください。",
        409,
      );
    }
    const capture: PriceCapture = {
      id,
      storeId,
      imagePath: `${id}.png`,
      ...extracted,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    repo.saveCapture(capture);
    return c.json({ ...capture, imageUrl: `/api/captures/${id}/image` }, 201);
  });
  app.get("/api/captures/:id/image", async (c) => {
    const capture = repo.capture(c.req.param("id"));
    if (!capture) throw bad("写真が見つかりません", 404);
    const bytes = await readFile(join(capturesDir, capture.imagePath));
    c.header("Content-Type", "image/png");
    return c.body(new Uint8Array(bytes));
  });
  app.post("/api/captures/:id/confirm", async (c) => {
    const { candidate, productId } = confirmSchema.parse(await c.req.json());
    const capture = repo.capture(c.req.param("id"));
    if (!capture) throw bad("写真が見つかりません", 404);
    if (capture.status === "confirmed")
      throw bad("この写真は反映済みです。再送は不要です。", 409);
    if (candidate.tax === "unknown")
      throw bad("税区分を確認してください。税不明の価格は反映できません。");
    const amount =
      candidate.tax === "excluded"
        ? withTax(yenToMinor(candidate.priceYen), candidate.taxRate)
        : yenToMinor(candidate.priceYen);
    const existing = productId
      ? repo
          .products()
          .find(
            (p) =>
              p.id === productId &&
              p.storeId === capture.storeId &&
              p.ingredientKey === candidate.ingredientKey,
          )
      : repo
          .products()
          .find(
            (p) =>
              p.storeId === capture.storeId &&
              p.ingredientKey === candidate.ingredientKey &&
              p.unit === candidate.unit &&
              p.quantity === candidate.quantity,
          );
    if (productId && !existing) throw bad("反映先の商品が一致しません");
    const product: Product = {
      id: existing?.id ?? randomUUID(),
      storeId: capture.storeId,
      name: candidate.name,
      ingredientKey: candidate.ingredientKey,
      quantity: candidate.quantity,
      unit: candidate.unit,
      priceMinor: candidate.sale ? (existing?.priceMinor ?? amount) : amount,
      stock: candidate.stock,
      source: "photo",
      updatedAt: new Date().toISOString(),
      ...(candidate.sale
        ? {
            salePriceMinor: amount,
            saleStart: candidate.saleStart!,
            saleEnd: candidate.saleEnd!,
          }
        : {}),
    };
    const previous = session.plan;
    const oldIndex =
      previous?.stores.findIndex((p) => p.store.id === capture.storeId) ?? -1;
    repo.confirm(
      {
        ...capture,
        status: "confirmed",
        confirmed: candidate,
        productId: product.id,
      },
      product,
    );
    const plan = previous
      ? result({
          intent: previous.intent,
          recipe: previous.recipe,
          warning: previous.warning,
        })
      : null;
    const newIndex =
      plan?.stores.findIndex((p) => p.store.id === capture.storeId) ?? -1;
    const sequence = session.sequence + 1;
    const name = stores.find((s) => s.id === capture.storeId)!.name;
    session = {
      plan,
      sequence,
      event: {
        sequence,
        kind: "capture",
        text: `${name}の値札を取り込み：${product.name} ${product.quantity}${product.unit === "piece" ? "個" : product.unit} ${formatMoney(amount)}${oldIndex >= 0 && newIndex >= 0 ? ` ・ ${oldIndex + 1}位 → ${newIndex + 1}位` : ""}`,
      },
    };
    const event: CaptureEvent = {
      ...snapshot(),
      storeId: capture.storeId,
      product: {
        name: product.name,
        quantity: product.quantity,
        unit: product.unit,
        priceMinor: amount,
      },
      oldTotal:
        oldIndex >= 0 ? previous!.stores[oldIndex].best.totalMinor : null,
      newTotal: newIndex >= 0 ? plan!.stores[newIndex].best.totalMinor : null,
      oldRank: oldIndex >= 0 ? oldIndex + 1 : null,
      newRank: newIndex >= 0 ? newIndex + 1 : null,
    };
    emit("capture", event);
    notify();
    return c.json({ product, revision: repo.revision });
  });
  app.post("/api/reset", async (c) => {
    repo.reset();
    const sequence = session.sequence + 1;
    session = {
      plan: null,
      sequence,
      event: { sequence, kind: "reset", text: "データを初期状態に戻しました" },
    };
    emit("plan", snapshot());
    notify();
    for (const name of await readdir(capturesDir).catch(() => []))
      if (/^[a-f0-9-]{36}\.png$/.test(name))
        await unlink(join(capturesDir, name)).catch(() => {});
    return c.json({ ok: true, revision: repo.revision });
  });
  app.notFound((c) => c.json({ error: "見つかりません" }, 404));
  return app;
}
