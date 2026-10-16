import type { Offer } from "../../domain/types.js";
export function StatusChip({ offer }: { offer: Offer }) {
  const missing = Math.max(0, offer.missingCount - offer.unknownCount);
  return (
    <span className={`status-chip ${offer.complete ? "ok" : "unknown"}`}>
      <i />
      {offer.complete
        ? "全部揃う"
        : [
            missing ? `欠品 ${missing}` : "",
            offer.unknownCount ? `在庫不明 ${offer.unknownCount}` : "",
          ]
            .filter(Boolean)
            .join(" ・ ") || "確認が必要"}
    </span>
  );
}
