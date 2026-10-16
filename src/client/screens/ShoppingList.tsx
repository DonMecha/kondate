import { Fragment, useState } from "react";
import type { Offer, PlanResult } from "../../domain/types.js";
import { formatMoney } from "../../domain/money.js";
import { stockLabels, unitLabels } from "../api.js";
import { StatusChip } from "../components/StatusChip.js";
export function ShoppingList({
  offer,
  plan,
}: {
  offer?: Offer;
  plan: PlanResult | null;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("kondate-checks") ?? "{}");
    } catch {
      return {};
    }
  });
  const [error, setError] = useState("");
  if (!offer || !plan)
    return (
      <section>
        <h1>買い物リスト</h1>
        <p>献立から店を選んでください。</p>
      </section>
    );
  const lines = [...offer.lines].sort((a, b) => {
    const order = (aisle: string) => {
      const i = offer.store.aisles.indexOf(aisle);
      return i < 0 ? 99 : i;
    };
    return order(a.aisle) - order(b.aisle);
  });
  const key = (name: string) => `${offer.id}:${plan.intent.servings}:${name}`;
  function toggle(name: string) {
    const next = { ...checked, [key(name)]: !checked[key(name)] };
    setChecked(next);
    try {
      localStorage.setItem("kondate-checks", JSON.stringify(next));
    } catch {
      setError("この端末ではチェックを保存できません");
    }
  }
  function download() {
    const text =
      `kondate / すべて架空のデータです\n${offer!.store.name} ・ ${offer!.dish} ・ ${plan!.intent.servings}人分\n税込合計${offer!.complete ? "" : "（参考額）"}: ${formatMoney(offer!.totalMinor)}\n\n` +
      lines
        .map(
          (l) =>
            `${checked[key(l.key)] ? "☑" : "☐"} [${l.aisle}] ${l.name} ${l.needed}${unitLabels[l.unit]} / ${l.purchases.map((p) => `${p.product.quantity}${unitLabels[p.product.unit]} × ${p.packs}`).join(" + ") || "商品なし"} / ${formatMoney(l.costMinor)} / ${stockLabels[l.stock]}`,
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kondate-shopping-list.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="list-screen">
      <div className="section-title">
        <h1>買い物リスト</h1>
        <button className="outline" onClick={download}>
          テキストを保存 ↓
        </button>
      </div>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      <article className="receipt shopping-receipt">
        <h2>{offer.store.name}</h2>
        <p>
          {offer.dish} ・ {plan.intent.servings}人分
        </p>
        <StatusChip offer={offer} />
        {!offer.complete && (
          <p className="feedback warning">
            欠品・在庫不明を含む参考額です。全部揃うとは判定していません。
          </p>
        )}
        {lines.map((line, index) => (
          <Fragment key={line.key}>
            {(index === 0 || lines[index - 1].aisle !== line.aisle) && (
              <h3 className="aisle-heading">{line.aisle}</h3>
            )}
            <label
              className={`shopping-row ${checked[key(line.key)] ? "checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(checked[key(line.key)])}
                onChange={() => toggle(line.key)}
              />
              <span>
                <b>{line.name}</b>
                <small>
                  必要 {line.needed}
                  {unitLabels[line.unit]} ／{" "}
                  {line.purchases
                    .map(
                      (p) =>
                        `${p.product.quantity}${unitLabels[p.product.unit]} × ${p.packs}`,
                    )
                    .join(" + ") || "商品なし"}
                  <br />
                  {stockLabels[line.stock]}
                </small>
              </span>
              <span className="num">{formatMoney(line.costMinor)}</span>
            </label>
          </Fragment>
        ))}
        <div className="list-total">
          <span>
            合計<small>{offer.complete ? "税込" : "参考額"}</small>
          </span>
          <strong className="num">{formatMoney(offer.totalMinor)}</strong>
        </div>
        <p className="footnote">
          チェックはこの端末に保存されます。価格・在庫はデモ用です。
        </p>
      </article>
    </section>
  );
}
