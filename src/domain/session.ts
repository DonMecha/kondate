import type { PlanResult, Product } from "./types.js";

export interface SessionEvent {
  sequence: number;
  kind: "plan" | "swap" | "capture" | "reset";
  text: string;
}
export interface SessionSnapshot {
  plan: PlanResult | null;
  event: SessionEvent | null;
  sequence: number;
}
export interface CaptureEvent extends SessionSnapshot {
  storeId: string;
  product: Pick<Product, "name" | "quantity" | "unit" | "priceMinor">;
  oldTotal: number | null;
  newTotal: number | null;
  oldRank: number | null;
  newRank: number | null;
}
