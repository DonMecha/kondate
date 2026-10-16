import type { Offer, StorePlan } from "../../domain/types.js";
import { formatMoney } from "../../domain/money.js";
import { stockLabels, unitLabels } from "../api.js";
import { PriceTag } from "./PriceTag.js";
import { SaleBadge } from "./SaleBadge.js";
import { StatusChip } from "./StatusChip.js";
import { SwapCard, swapSummary } from "./SwapCard.js";
export function ReceiptCard({
  plan,
  offer,
  expanded,
  onOpen,
  onOffer,
  onCapture,
}: {
  plan: StorePlan;
  offer: Offer;
  expanded: boolean;
  onOpen: () => void;
  onOffer: (offer: Offer) => void;
  onCapture: () => void;
}) {
  return (
    <article className="receipt store-receipt" data-store={plan.store.id}>
      <button
        className="receipt-toggle"
        aria-expanded={expanded}
        onClick={onOpen}
        aria-label={`${plan.store.name}の詳細`}
      >
        <span>
          <strong>{plan.store.name}</strong>
          <small>
            徒歩{plan.store.walkMinutes}分 ・ {plan.store.hours}
          </small>
        </span>
        <span className="receipt-total num">
          {formatMoney(offer.totalMinor)}
          <small className={offer.withinBudget ? "within" : "over"}>
            {offer.withinBudget ? "予算より " : "予算を "}
            {formatMoney(Math.abs(offer.budgetDifferenceMinor))}
            {offer.withinBudget ? " 安い" : " 超過"}
          </small>
        </span>
      </button>
      <div className="receipt-meta">
        <StatusChip offer={offer} />
        {offer.lines.some((l) => l.sale) && <SaleBadge />}
        {offer.lines.some((l) =>
          l.purchases.some((p) => p.product.source === "photo"),
        ) && <PriceTag>写真で更新</PriceTag>}
      </div>
      {!expanded ? (
        <p className="swap-summary">
          {swapSummary(offer, plan)}
          <span className="expand-hint">詳細を開く ＋</span>
        </p>
      ) : (
        <>
          <SwapCard offer={offer} plan={plan} />
          <div className="receipt-lines">
            {offer.lines.map((line) => (
              <div className="receipt-line" key={line.key}>
                <div>
                  <b>{line.name}</b>
                  <small>
                    {line.needed}
                    {unitLabels[line.unit]} ／{" "}
                    {line.purchases
                      .map(
                        (p) =>
                          `${p.product.quantity}${unitLabels[p.product.unit]} × ${p.packs}`,
                      )
                      .join(" + ") || "商品なし"}{" "}
                    ・ {stockLabels[line.stock]}
                  </small>
                  {line.purchases.some((p) => p.product.source === "photo") && (
                    <PriceTag>写真で更新</PriceTag>
                  )}
                </div>
                <span className="num">{formatMoney(line.costMinor)}</span>
              </div>
            ))}
          </div>
          <p className="footnote">
            {offer.complete ? "税込合計" : "欠品・在庫不明を含む参考額"} ・{" "}
            {offer.dish}
          </p>
          <details className="alternatives">
            <summary>
              組み替え候補を比較（{plan.alternatives.length}案）
            </summary>
            <div className="offer-options">
              {[plan.original, ...plan.alternatives].map((item) => (
                <button
                  key={item.id}
                  aria-pressed={offer.id === item.id}
                  onClick={() => onOffer(item)}
                >
                  <b>{item.dish}</b>
                  <SwapCard offer={item} plan={plan} />
                  <span className="num">{formatMoney(item.totalMinor)}</span>
                  <StatusChip offer={item} />
                  <small>{item.reason}</small>
                </button>
              ))}
            </div>
          </details>
          <button className="outline full" onClick={onCapture}>
            この店の値札を撮る
          </button>
        </>
      )}
    </article>
  );
}
