import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIService,
  createProvider,
  OllamaProvider,
  ScriptedProvider,
  validated,
  type AIProvider,
} from "../src/ai/providers.js";
import { intentSchema } from "../src/ai/schemas.js";
const valid = {
  dish: "肉じゃが",
  servings: 3,
  budgetYen: "2000",
  excluded: [],
};
function fake(responses: unknown[]): AIProvider & { calls: number } {
  return {
    name: "test",
    calls: 0,
    async generate() {
      return responses[this.calls++];
    },
  };
}
test("スキーマ不一致時1回だけ再試行し、2回目が正しければ採用", async () => {
  const p = fake([{ ...valid, servings: "3" }, JSON.stringify(valid)]);
  assert.deepEqual(await validated(p, "intent", "test", intentSchema), valid);
  assert.equal(p.calls, 2);
});
test("2回失敗時は登録レシピに縮退。未登録レシピは捏造しない", async () => {
  const p = fake(["broken", "{}"]);
  const result = await new AIService(p).interpret(
    "肉じゃが、3人分、2,000円以内",
  );
  assert.equal(p.calls, 2);
  assert.ok(result.warning);
  assert.equal(result.intent.budgetMinor, 200000);
  const q = fake(["{}", "{}"]);
  await assert.rejects(
    () => new AIService(q).interpret("未登録の宇宙スープ"),
    /登録済み/,
  );
  assert.equal(q.calls, 2);
});
test("値札の2回失敗は空候補と手入力へ縮退し、在庫を補完しない", async () => {
  const p = fake([{}, {}]);
  const result = await new AIService(p).readCapture(Buffer.from("image"));
  assert.deepEqual(result.candidates, []);
  assert.ok(result.warning);
  assert.equal(p.calls, 2);
});
test("登録外料理のAI材料表もスキーマ検証する", async () => {
  const p = fake([
    { ...valid, dish: "鶏ももとトマトの煮込み" },
    {
      id: "temp",
      name: "鶏ももとトマトの煮込み",
      servings: 3,
      items: [
        { key: "chicken-thigh", quantity: 300, unit: "g", required: true },
      ],
      substitutions: [],
    },
  ]);
  assert.equal(
    (await new AIService(p).interpret("鶏ももとトマトの煮込み")).recipe.id,
    "temp",
  );
  assert.equal(p.calls, 2);
});
test("scriptedは無回線で15品と除外を解釈し、在庫はunknown", async () => {
  const ai = new AIService(new ScriptedProvider());
  const r = await ai.interpret("肉じゃが、4人分、1,000円、豚肉なし");
  assert.equal(r.intent.servings, 4);
  assert.ok(r.intent.excluded.includes("pork-komagire"));
  assert.equal(
    (await ai.readCapture(Buffer.from(""))).candidates[0].stock,
    "unknown",
  );
});
test("Ollamaは互換APIでなく/api/chatへmodelと画像とJSON schemaを送る", async () => {
  const original = globalThis.fetch;
  let request: any;
  globalThis.fetch = async (url, init) => {
    request = { url, ...JSON.parse(init!.body as string) };
    return Response.json({ message: { content: JSON.stringify(valid) } });
  };
  try {
    const p = new OllamaProvider({
      url: "http://127.0.0.1:11434",
      textModel: "text",
      visionModel: "vision",
      timeoutMs: 1000,
    });
    await p.generate("capture", "test", {}, Buffer.from("test"));
    assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
    assert.equal(request.model, "vision");
    assert.equal(
      request.messages[1].images[0],
      Buffer.from("test").toString("base64"),
    );
    assert.equal(request.stream, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("未設定の提供元は拒否し、有料の差し込み口は呼出ししない", async () => {
  assert.throws(() => createProvider("unknown"));
});
test("画像AIが在庫ありと返しても採用せず、人の確認までunknownに固定する", async () => {
  const p = fake([
    {
      candidates: [
        {
          name: "豚こま肉",
          ingredientKey: "pork-komagire",
          priceYen: "180",
          tax: "included",
          taxRate: 8,
          quantity: 300,
          unit: "g",
          stock: "in",
          confidence: 1,
          sale: false,
          saleStart: null,
          saleEnd: null,
        },
      ],
    },
  ]);
  assert.equal(
    (await new AIService(p).readCapture(Buffer.from("image"))).candidates[0]
      .stock,
    "unknown",
  );
});
