// 金額は常に円の100分の1。小数の乗算とAIによる計算を使わない。
export const MAX_MONEY = 100_000_000;
export function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY)
    throw new Error("金額が範囲外です");
  return value;
}
export function yenToMinor(value: string): number {
  const normalized = value.normalize("NFKC").replaceAll(",", "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized))
    throw new Error("金額は小数2桁までの数値で入力してください");
  const [whole, fraction = ""] = normalized.split(".");
  return money(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function withTax(minor: number, rate: 8 | 10): number {
  // 試作の税計算は商品単位、円の100分の1未満を切り捨て。
  return money(Math.floor((money(minor) * (100 + rate)) / 100));
}
export function formatMoney(minor: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
