import type { Offer, StorePlan } from "../../domain/types.js";
import { formatMoney } from "../../domain/money.js";
import { SaleBadge } from "./SaleBadge.js";
export function swapSummary(offer: Offer, plan: StorePlan) {
  if (!offer.changes.length)
    return offer.complete ? "献立そのままで揃います" : "在庫の確認が必要です";
  return offer.changes
    .map(
      (c) =>
        `${plan.original.lines.find((l) => l.key === c.from)?.name ?? c.from} → ${offer.lines.find((l) => l.key === c.to)?.name ?? c.to}`,
    )
    .join(" ・ ");
}
export function SwapCard({ offer, plan }: { offer: Offer; plan: StorePlan }) {
  return (
    <div className="swaps">
      {offer.changes.map((change) => {
        const from = plan.original.lines.find((l) => l.key === change.from),
          to = offer.lines.find((l) => l.key === change.to);
        const reason =
          from?.stock === "out"
            ? "欠品"
            : from?.stock === "unknown"
              ? "在庫不明"
              : "割高";
        return (
          <div className="swap-card" key={change.from}>
            <div className="swap-from">
              <b>{from?.name}</b>
              <small>{reason}</small>
            </div>
            <span className="swap-arrow" aria-hidden="true">
              →
            </span>
            <div className="swap-to">
              <b>{to?.name}</b> {to?.sale && <SaleBadge />}
              <small className="num">
                {formatMoney(to?.costMinor ?? 0)} ・{" "}
                {offer.savingMinor >= 0 ? "−" : "+"}
                {formatMoney(Math.abs(offer.savingMinor))}
              </small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
