import type { ReactNode } from "react";
import { formatMoney } from "../../domain/money.js";
export function PriceTag({
  amount,
  rank,
  children,
}: {
  amount?: number;
  rank?: number;
  children?: ReactNode;
}) {
  return (
    <span className={`price-tag ${rank === 1 ? "best" : ""}`}>
      {rank && <span className="tag-rank">{rank}</span>}
      {amount !== undefined ? formatMoney(amount) : children}
    </span>
  );
}
