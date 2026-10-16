import { ingredients } from "./seed.js";
import { money } from "./money.js";
import type {
  MatchLine,
  Offer,
  Product,
  Recipe,
  RequestIntent,
  Store,
  StorePlan,
  Substitution,
} from "./types.js";
const norm = (s: string) =>
  s.normalize("NFKC").replace(/\s/g, "").toLowerCase();
export function ingredientFor(value: string) {
  return ingredients.find((i) =>
    [i.key, i.name, ...i.aliases].some((n) => norm(n) === norm(value)),
  );
}
export function isExcluded(key: string, excluded: string[]) {
  const i = ingredientFor(key);
  return excluded.some((e) => {
    const other = ingredientFor(e);
    return other
      ? other.key === key
      : [key, i?.name ?? "", ...(i?.aliases ?? [])].some(
          (n) => norm(e).length > 0 && norm(n).includes(norm(e)),
        );
  });
}
export function effectivePrice(p: Product, at: Date) {
  const time = at.getTime(),
    start = Date.parse(p.saleStart ?? ""),
    end = Date.parse(p.saleEnd ?? "");
  const sale =
    p.salePriceMinor !== undefined &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    time >= start &&
    time <= end;
  return { priceMinor: money(sale ? p.salePriceMinor! : p.priceMinor), sale };
}
export function packsNeeded(
  quantity: number,
  servings: number,
  baseServings: number,
  packageQuantity: number,
): number {
  if (
    ![quantity, servings, baseServings, packageQuantity].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new Error("分量は正の整数が必要です");
  const numerator = quantity * servings,
    denominator = baseServings * packageQuantity;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator))
    throw new Error("分量が範囲外です");
  return Math.ceil(numerator / denominator);
}
// 必要量へ到達する最小費用をDPで求める。大小パックの混在・余剰を許す。
function cheapestPurchase(
  needed: number,
  candidates: { p: Product; sale: boolean }[],
) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = candidates.reduce((n, c) => gcd(n, c.p.quantity), 0);
  const target = Math.ceil(needed / divisor);
  if (target > 2_000_000) throw new Error("購入量が範囲外です");
  const costs = new Float64Array(target + 1).fill(Infinity);
  costs[0] = 0;
  const previous = new Int32Array(target + 1).fill(-1),
    choice = new Int32Array(target + 1).fill(-1);
  for (let n = 0; n < target; n++)
    if (Number.isFinite(costs[n]))
      candidates.forEach((c, i) => {
        const next = Math.min(target, n + c.p.quantity / divisor);
        const unitCost = c.sale ? c.p.salePriceMinor! : c.p.priceMinor;
        if (costs[n] + unitCost < costs[next]) {
          costs[next] = costs[n] + unitCost;
          previous[next] = n;
          choice[next] = i;
        }
      });
  const counts = new Map<number, number>();
  for (let n = target; n > 0; n = previous[n]) {
    const i = choice[n];
    if (i < 0) throw new Error("購入量を満たせません");
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  return [...counts].map(([i, packs]) => {
    const c = candidates[i];
    return {
      product: c.p,
      packs,
      costMinor: money((c.sale ? c.p.salePriceMinor! : c.p.priceMinor) * packs),
      sale: c.sale,
    };
  });
}
export function matchRecipe(
  recipe: Recipe,
  store: Store,
  products: Product[],
  intent: RequestIntent,
  changes: Substitution[] = [],
  at = new Date(),
): Offer {
  const grouped = new Map<string, Recipe["items"][number]>();
  for (const item of recipe.items) {
    const key = changes.find((c) => c.from === item.key)?.to ?? item.key;
    const id = `${key}:${item.unit}:${item.required}`;
    const existing = grouped.get(id);
    grouped.set(id, {
      ...item,
      key,
      quantity: item.quantity + (existing?.quantity ?? 0),
    });
  }
  const lines: MatchLine[] = [...grouped.values()].map((item) => {
    const key = item.key;
    const ingredient = ingredientFor(key);
    const excluded = isExcluded(key, intent.excluded);
    // 正式キーを優先し、ない場合のみ別名で照合。単位の推測変換はしない。
    const compatible = products.filter(
      (p) => p.storeId === store.id && p.unit === item.unit,
    );
    const exact = compatible.filter((p) => p.ingredientKey === key);
    const candidates = (
      exact.length
        ? exact
        : compatible.filter((p) => ingredientFor(p.name)?.key === key)
    )
      .map((p) => {
        const { priceMinor, sale } = effectivePrice(p, at),
          packs = packsNeeded(
            item.quantity,
            intent.servings,
            recipe.servings,
            p.quantity,
          );
        return { p, packs, sale, costMinor: money(priceMinor * packs) };
      })
      .sort(
        (a, b) =>
          Number(!["in", "low"].includes(a.p.stock)) -
            Number(!["in", "low"].includes(b.p.stock)) ||
          a.costMinor - b.costMinor ||
          a.p.id.localeCompare(b.p.id),
      );
    const available = candidates.filter((c) =>
      ["in", "low"].includes(c.p.stock),
    );
    const selected = candidates[0];
    const needed = Math.ceil(
      (item.quantity * intent.servings) / recipe.servings,
    );
    const purchases = available.length
      ? cheapestPurchase(needed, available)
      : selected
        ? [
            {
              product: selected.p,
              packs: selected.packs,
              costMinor: selected.costMinor,
              sale: selected.sale,
            },
          ]
        : [];
    const chosen = purchases[0]?.product;
    const stock = purchases.some((p) => p.product.stock === "low")
      ? "low"
      : (chosen?.stock ?? "unknown");
    return {
      key,
      name: ingredient?.name ?? key,
      required: item.required,
      needed: Math.ceil((item.quantity * intent.servings) / recipe.servings),
      unit: item.unit,
      stock: excluded ? "out" : stock,
      product: chosen,
      purchases,
      packs: purchases.reduce((n, p) => n + p.packs, 0),
      costMinor: money(purchases.reduce((n, p) => n + p.costMinor, 0)),
      sale: purchases.some((p) => p.sale),
      aisle: ingredient?.aisle ?? "その他",
      excluded,
    };
  });
  const missingCount = lines.filter(
    (l) => l.required && (l.excluded || !["in", "low"].includes(l.stock)),
  ).length;
  const totalMinor = money(
    lines
      .filter((l) => l.required || ["in", "low"].includes(l.stock))
      .reduce((sum, l) => sum + l.costMinor, 0),
  );
  return {
    id: `${store.id}:${changes.map((c) => `${c.from}>${c.to}`).join(",") || "original"}`,
    store,
    dish: changes.length ? changes.map((c) => c.name).join("・") : recipe.name,
    lines,
    complete: missingCount === 0,
    missingCount,
    unknownCount: lines.filter((l) => l.required && l.stock === "unknown")
      .length,
    totalMinor,
    withinBudget: totalMinor <= intent.budgetMinor,
    budgetDifferenceMinor: intent.budgetMinor - totalMinor,
    changes,
    savingMinor: 0,
    reason: changes.map((c) => c.note).join(" "),
  };
}
export function compareOffers(a: Offer, b: Offer) {
  return (
    Number(b.complete) - Number(a.complete) ||
    Number(b.withinBudget) - Number(a.withinBudget) ||
    a.totalMinor - b.totalMinor ||
    a.changes.length - b.changes.length ||
    a.id.localeCompare(b.id)
  );
}
export function planStores(
  recipe: Recipe,
  stores: Store[],
  products: Product[],
  intent: RequestIntent,
  at = new Date(),
): StorePlan[] {
  const valid = recipe.substitutions.filter(
    (c) =>
      recipe.items.some((i) => i.key === c.from) &&
      ingredientFor(c.from)?.group &&
      ingredientFor(c.from)?.group === ingredientFor(c.to)?.group &&
      !isExcluded(c.to, intent.excluded),
  );
  const sets: Substitution[][] = valid.map((c) => [c]);
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++)
      if (valid[i].from !== valid[j].from) sets.push([valid[i], valid[j]]);
  return stores
    .map((store) => {
      const original = matchRecipe(recipe, store, products, intent, [], at);
      const alternatives = sets
        .map((changes) => {
          const offer = matchRecipe(
            recipe,
            store,
            products,
            intent,
            changes,
            at,
          );
          offer.savingMinor = original.totalMinor - offer.totalMinor;
          return offer;
        })
        .filter(
          (o) =>
            !o.lines.some((l) => l.required && l.excluded) &&
            (!original.complete ||
              !original.withinBudget ||
              o.totalMinor < original.totalMinor),
        )
        .sort(compareOffers)
        .slice(0, 3);
      return {
        store,
        original,
        alternatives,
        best: [original, ...alternatives].sort(compareOffers)[0],
      };
    })
    .sort((a, b) => compareOffers(a.best, b.best));
}
