import { z } from "zod";
import { ingredients } from "../domain/seed.js";
import { yenToMinor } from "../domain/money.js";
const text = z.string().trim().min(1).max(100);
export const unitSchema = z.enum(["g", "ml", "piece"]);
const quantity = z.number().int().min(1).max(100_000);
const key = z.enum(ingredients.map((i) => i.key) as [string, ...string[]]);
export const yenSchema = z.string().refine((s) => {
  try {
    yenToMinor(s);
    return true;
  } catch {
    return false;
  }
}, "金額の形式が不正です");
export const intentSchema = z
  .object({
    dish: text,
    servings: z.number().int().min(1).max(20),
    budgetYen: yenSchema,
    excluded: z.array(text).max(20),
  })
  .strict();
export const recipeSchema = z
  .object({
    id: text,
    name: text,
    servings: z.number().int().min(1).max(20),
    items: z
      .array(
        z
          .object({ key, quantity, unit: unitSchema, required: z.boolean() })
          .strict(),
      )
      .min(1)
      .max(20),
    substitutions: z
      .array(
        z
          .object({ from: key, to: key, name: text, note: z.string().max(160) })
          .strict(),
      )
      .max(10),
  })
  .strict();
export const candidateSchema = z
  .object({
    name: text,
    ingredientKey: key,
    priceYen: yenSchema,
    tax: z.enum(["included", "excluded", "unknown"]),
    taxRate: z.union([z.literal(8), z.literal(10)]),
    quantity,
    unit: unitSchema,
    stock: z.enum(["in", "low", "out", "unknown"]),
    confidence: z.number().min(0).max(1),
    sale: z.boolean(),
    saleStart: z.iso.datetime().nullable(),
    saleEnd: z.iso.datetime().nullable(),
  })
  .strict()
  .refine(
    (c) =>
      !c.sale ||
      (c.saleStart !== null &&
        c.saleEnd !== null &&
        Date.parse(c.saleStart) <= Date.parse(c.saleEnd)),
    "特売の開始・終了が必要です",
  );
export const captureSchema = z
  .object({ candidates: z.array(candidateSchema).max(10) })
  .strict();
export const planBodySchema = z
  .object({ text: z.string().trim().min(1).max(1000) })
  .strict();
export const recalculateSchema = z
  .object({
    intent: z
      .object({
        dish: text,
        servings: z.number().int().min(1).max(20),
        budgetMinor: z.number().int().min(0).max(100_000_000),
        excluded: z.array(text).max(20),
      })
      .strict(),
    recipe: recipeSchema,
  })
  .strict();
export const confirmSchema = z
  .object({
    candidate: candidateSchema,
    productId: z.string().max(100).optional(),
  })
  .strict();
