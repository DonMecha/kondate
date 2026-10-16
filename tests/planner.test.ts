import { test } from "node:test";
import assert from "node:assert/strict";
import { seedProducts, recipes, stores } from "../src/domain/seed.js";
import {
  compareOffers,
  effectivePrice,
  matchRecipe,
  packsNeeded,
  planStores,
} from "../src/domain/planner.js";
import { withTax, yenToMinor } from "../src/domain/money.js";
const intent = {
  dish: "肉じゃが",
  servings: 3,
  budgetMinor: 200000,
  excluded: [],
};
const products = seedProducts();
test("金額は100分の1円の整数・小数境界・上限を保つ", () => {
  assert.equal(yenToMinor("1,280.09"), 128009);
  assert.equal(yenToMinor("０.０１"), 1);
  assert.equal(withTax(101, 8), 109);
  for (const input of ["-1", "1.001", "Infinity", "1000001", "1e3"])
    assert.throws(() => yenToMinor(input));
});
test("買う個数は人数とパック量から切り上げる", () => {
  assert.equal(packsNeeded(300, 4, 3, 300), 2);
  assert.equal(packsNeeded(300, 3, 3, 300), 1);
  assert.throws(() => packsNeeded(1, 1, 1, 0));
});
test("特売は開始・終了の両境界で有効、外側と期間不正は通常価格", () => {
  const p = {
    ...products[0],
    salePriceMinor: 100,
    saleStart: "2026-10-17T00:00:00Z",
    saleEnd: "2026-10-17T23:59:59Z",
  };
  for (const t of [p.saleStart, p.saleEnd])
    assert.equal(effectivePrice(p, new Date(t)).priceMinor, 100);
  for (const t of ["2026-10-16T23:59:59Z", "2026-10-18T00:00:00Z"])
    assert.equal(effectivePrice(p, new Date(t)).priceMinor, p.priceMinor);
  assert.equal(
    effectivePrice({ ...p, saleStart: "invalid" }, new Date()).sale,
    false,
  );
});
test("在庫unknown・商品データなし・outは揃うと数えず、lowは在庫あり", () => {
  assert.equal(
    matchRecipe(recipes[0], stores[3], products, intent).complete,
    false,
  );
  const missing = matchRecipe(recipes[0], stores[0], [], intent);
  assert.equal(missing.unknownCount, 5);
  assert.equal(missing.complete, false);
  assert.equal(
    matchRecipe(recipes[0], stores[0], products, intent).missingCount,
    1,
  );
  assert.equal(
    planStores(recipes[0], stores, products, intent).find(
      (s) => s.store.id === "s1",
    )!.best.complete,
    true,
  );
});
test("台本1280→890、予算ちょうどは内、0.01円不足は超過", () => {
  const a = planStores(recipes[0], stores, products, intent).find(
    (s) => s.store.id === "s1",
  )!;
  assert.equal(a.original.totalMinor, 128000);
  assert.equal(a.best.totalMinor, 89000);
  assert.equal(a.best.savingMinor, 39000);
  assert.equal(
    matchRecipe(recipes[0], stores[1], products, {
      ...intent,
      budgetMinor: 110000,
    }).withinBudget,
    true,
  );
  assert.equal(
    matchRecipe(recipes[0], stores[1], products, {
      ...intent,
      budgetMinor: 109999,
    }).withinBudget,
    false,
  );
});
test("別名照合・同材料パックごとの購入総額の最小化・在庫を価格より優先", () => {
  const p = products.find((p) => p.id === "s2-beef-sliced")!;
  const extras = [
    { ...p, id: "small", quantity: 100, priceMinor: 20000 },
    { ...p, id: "large", quantity: 500, priceMinor: 45000 },
    { ...p, id: "absent", priceMinor: 1, stock: "out" as const },
  ];
  const line = matchRecipe(
    recipes[0],
    stores[1],
    [...products.filter((q) => q.id !== p.id), ...extras],
    intent,
  ).lines[0];
  assert.equal(line.product?.id, "large");
  assert.equal(line.costMinor, 45000);
  assert.equal(
    matchRecipe(
      recipes[0],
      stores[1],
      [{ ...p, ingredientKey: "unmapped", name: "牛肉" }],
      intent,
    ).lines[0].stock,
    "in",
  );
});
test("代替は定義済みの同グループのみ、除外の豚肉は案に入れない", () => {
  const p = planStores(
    {
      ...recipes[0],
      substitutions: [
        ...recipes[0].substitutions,
        { from: "beef-sliced", to: "tofu", name: "不可", note: "" },
      ],
    },
    stores,
    products,
    { ...intent, excluded: ["豚肉"] },
  );
  assert.ok(
    p.every((s) =>
      s.alternatives.every((a) =>
        a.changes.every((c) => c.to !== "pork-komagire" && c.to !== "tofu"),
      ),
    ),
  );
});
test("2材料までの代替を探索し、3材料は替えない", () => {
  const r = {
    id: "two",
    name: "試験",
    servings: 3,
    items: [
      { key: "beef-sliced", quantity: 300, unit: "g" as const, required: true },
      {
        key: "chicken-thigh",
        quantity: 300,
        unit: "g" as const,
        required: true,
      },
    ],
    substitutions: [
      { from: "beef-sliced", to: "pork-komagire", name: "豚", note: "代替" },
      { from: "chicken-thigh", to: "pork-komagire", name: "豚", note: "代替" },
    ],
  };
  const result = planStores(
    r,
    [stores[0]],
    products.filter((p) => p.ingredientKey !== "chicken-thigh"),
    intent,
  )[0];
  assert.ok(
    result.alternatives.some((a) => a.changes.length === 2 && a.complete),
  );
  assert.ok(result.alternatives.every((a) => a.changes.length <= 2));
});
test("順位は揃う→予算内→総額→変更数", () => {
  const all = planStores(recipes[0], stores, products, intent);
  assert.equal(all[0].store.id, "s1");
  assert.equal(all.at(-1)?.store.id, "s4");
  const a = all[0].best;
  assert.ok(compareOffers(a, { ...a, complete: false, totalMinor: 1 }) < 0);
  assert.ok(compareOffers(a, { ...a, withinBudget: false, totalMinor: 1 }) < 0);
  assert.ok(compareOffers({ ...a, changes: [] }, a) < 0);
});
test("大小パックを混ぜた組合せで最小費用を選び、同じ材料は合算する", () => {
  const p = products.find((p) => p.id === "s2-beef-sliced")!;
  const r = {
    ...recipes[0],
    items: [
      { key: "beef-sliced", quantity: 800, unit: "g" as const, required: true },
    ],
  };
  const line = matchRecipe(
    r,
    stores[1],
    [
      { ...p, id: "500", quantity: 500, priceMinor: 40000 },
      { ...p, id: "300", quantity: 300, priceMinor: 27000 },
    ],
    intent,
  ).lines[0];
  assert.equal(line.costMinor, 67000);
  assert.equal(line.purchases.length, 2);
  const repeated = {
    ...r,
    items: [
      { ...r.items[0], quantity: 150 },
      { ...r.items[0], quantity: 150 },
    ],
  };
  assert.equal(
    matchRecipe(repeated, stores[1], [p], intent).lines[0].costMinor,
    50000,
  );
});
test("2材料の代替は元の材料へ一度だけ適用し、連鎖して替えない", () => {
  const r = {
    id: "chain",
    name: "試験",
    servings: 3,
    items: [
      { key: "beef-sliced", quantity: 300, unit: "g" as const, required: true },
      {
        key: "pork-komagire",
        quantity: 150,
        unit: "g" as const,
        required: true,
      },
    ],
    substitutions: [
      {
        from: "beef-sliced",
        to: "pork-komagire",
        name: "豚",
        note: "一度だけ",
      },
      {
        from: "pork-komagire",
        to: "chicken-thigh",
        name: "鶏",
        note: "一度だけ",
      },
    ],
  };
  const result = planStores(r, [stores[0]], products, intent)[0];
  const both = result.alternatives.find((a) => a.changes.length === 2)!;
  assert.ok(both);
  assert.ok(
    both.lines.some((l) => l.key === "pork-komagire" && l.needed === 300),
  );
  assert.ok(
    both.lines.some((l) => l.key === "chicken-thigh" && l.needed === 150),
  );
});
