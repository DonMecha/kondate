import type { Ingredient } from "../domain/types.js";
export type Config = {
  provider: string;
  ingredients: Ingredient[];
  recipes: { id: string; name: string }[];
  revision: number;
  mapCenter: [number, number];
};
// QRの鍵はURLから即座に除去し、HttpOnlyのセッションCookieに交換する。
const url = new URL(location.href);
const key = url.searchParams.get("k");
if (key) {
  url.searchParams.delete("k");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}
const connected = key
  ? fetch("/api/session/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Demo-Key": key },
      body: "{}",
    }).then((r) => {
      if (!r.ok) throw new Error("会場のQRコードを読み直してください");
    })
  : Promise.resolve();
export async function api<T>(path: string, body?: unknown): Promise<T> {
  await connected;
  const response = await fetch(
    path,
    body instanceof FormData
      ? { method: "POST", body }
      : body !== undefined
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "接続に失敗しました");
  return result;
}
export const stockLabels = {
  in: "在庫あり",
  low: "残りわずか",
  out: "欠品",
  unknown: "在庫不明",
};
export const unitLabels = { g: "g", ml: "ml", piece: "個" };
