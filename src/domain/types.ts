export type Unit = "g" | "ml" | "piece";
export type Stock = "in" | "low" | "out" | "unknown";
export interface Store {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hours: string;
  walkMinutes: number;
  aisles: string[];
}
export interface Ingredient {
  key: string;
  name: string;
  aliases: string[];
  group?: string;
  aisle: string;
}
export interface Product {
  id: string;
  storeId: string;
  name: string;
  ingredientKey: string;
  quantity: number;
  unit: Unit;
  priceMinor: number;
  salePriceMinor?: number;
  saleStart?: string;
  saleEnd?: string;
  stock: Stock;
  source: "seed" | "photo" | "manual";
  updatedAt: string;
}
export interface RecipeItem {
  key: string;
  quantity: number;
  unit: Unit;
  required: boolean;
}
export interface Substitution {
  from: string;
  to: string;
  name: string;
  note: string;
}
export interface Recipe {
  id: string;
  name: string;
  servings: number;
  items: RecipeItem[];
  substitutions: Substitution[];
}
export interface RequestIntent {
  dish: string;
  servings: number;
  budgetMinor: number;
  excluded: string[];
}
export interface MatchLine {
  key: string;
  name: string;
  required: boolean;
  needed: number;
  unit: Unit;
  stock: Stock;
  product?: Product;
  purchases: {
    product: Product;
    packs: number;
    costMinor: number;
    sale: boolean;
  }[];
  packs: number;
  costMinor: number;
  sale: boolean;
  aisle: string;
  excluded: boolean;
}
export interface Offer {
  id: string;
  store: Store;
  dish: string;
  lines: MatchLine[];
  complete: boolean;
  missingCount: number;
  unknownCount: number;
  totalMinor: number;
  withinBudget: boolean;
  budgetDifferenceMinor: number;
  changes: Substitution[];
  savingMinor: number;
  reason: string;
}
export interface StorePlan {
  store: Store;
  original: Offer;
  alternatives: Offer[];
  best: Offer;
}
export interface PlanResult {
  intent: RequestIntent;
  recipe: Recipe;
  stores: StorePlan[];
  warning?: string;
  provider: string;
  revision: number;
}
export interface CaptureCandidate {
  name: string;
  ingredientKey: string;
  priceYen: string;
  tax: "included" | "excluded" | "unknown";
  taxRate: 8 | 10;
  quantity: number;
  unit: Unit;
  stock: Stock;
  confidence: number;
  sale: boolean;
  saleStart: string | null;
  saleEnd: string | null;
}
export interface PriceCapture {
  id: string;
  storeId: string;
  imagePath: string;
  candidates: CaptureCandidate[];
  warning?: string;
  status: "pending" | "confirmed";
  createdAt: string;
  confirmed?: CaptureCandidate;
  productId?: string;
}
