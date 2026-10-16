import type { Ingredient, Product, Recipe, Store, Unit } from "./types.js";
export const ingredients: Ingredient[] = [
  ["beef-sliced", "牛薄切り肉", ["牛肉", "牛薄切り"], "meat", "精肉"],
  [
    "pork-komagire",
    "豚こま肉",
    ["豚こま", "豚小間切れ", "豚肉"],
    "meat",
    "精肉",
  ],
  ["chicken-thigh", "鶏もも肉", ["鶏肉", "鶏もも"], "meat", "精肉"],
  ["potato", "じゃがいも", ["馬鈴薯"], undefined, "青果"],
  ["carrot", "にんじん", ["人参"], undefined, "青果"],
  ["onion", "玉ねぎ", ["たまねぎ"], undefined, "青果"],
  ["shirataki", "しらたき", ["白滝"], undefined, "日配"],
  ["cabbage", "キャベツ", [], undefined, "青果"],
  ["egg", "卵", ["たまご"], undefined, "日配"],
  ["tofu", "豆腐", [], undefined, "日配"],
  ["salmon", "鮭", ["さけ"], undefined, "鮮魚"],
  ["mackerel", "さば", ["サバ"], undefined, "鮮魚"],
  ["spinach", "ほうれん草", [], undefined, "青果"],
  ["bean-sprout", "もやし", [], undefined, "青果"],
  ["tomato", "トマト", [], undefined, "青果"],
  ["rice", "米", ["ご飯", "ごはん"], undefined, "穀類"],
  ["pasta", "パスタ", ["スパゲティ"], undefined, "穀類"],
  ["curry-roux", "カレールー", [], undefined, "調味料"],
  ["miso", "味噌", ["みそ"], undefined, "調味料"],
  ["soy-sauce", "醤油", ["しょうゆ"], undefined, "調味料"],
].map(([key, name, aliases, group, aisle]) => ({
  key,
  name,
  aliases,
  group,
  aisle,
})) as Ingredient[];
const aisles = ["青果", "精肉", "鮮魚", "日配", "穀類", "調味料"];
export const stores: Store[] = [
  {
    id: "s1",
    name: "まどいマルシェ",
    lat: 35.681,
    lng: 139.767,
    hours: "9:00–21:00",
    walkMinutes: 4,
    aisles,
  },
  {
    id: "s2",
    name: "こもれび食料店",
    lat: 35.684,
    lng: 139.771,
    hours: "10:00–22:00",
    walkMinutes: 7,
    aisles,
  },
  {
    id: "s3",
    name: "夕凪ストア",
    lat: 35.678,
    lng: 139.773,
    hours: "8:00–20:00",
    walkMinutes: 9,
    aisles,
  },
  {
    id: "s4",
    name: "ひだまり市場",
    lat: 35.677,
    lng: 139.763,
    hours: "9:30–20:30",
    walkMinutes: 11,
    aisles,
  },
];
function item(
  key: string,
  quantity: number,
  unit: Unit = "g",
  required = true,
) {
  return { key, quantity, unit, required };
}
const meatRules = [
  {
    from: "beef-sliced",
    to: "pork-komagire",
    name: "豚こまの肉じゃが",
    note: "豚肉のうまみで、やさしい味わいに。",
  },
  {
    from: "beef-sliced",
    to: "chicken-thigh",
    name: "鶏ももの肉じゃが",
    note: "鶏ももで、あっさりとした煮物に。",
  },
];
function recipe(
  id: string,
  name: string,
  items: ReturnType<typeof item>[],
  substitutions: Recipe["substitutions"] = [],
): Recipe {
  return { id, name, servings: 3, items, substitutions };
}
export const recipes: Recipe[] = [
  recipe(
    "nikujaga",
    "肉じゃが",
    [
      item("beef-sliced", 300),
      item("potato", 450),
      item("carrot", 150),
      item("onion", 300),
      item("shirataki", 200),
    ],
    meatRules,
  ),
  recipe(
    "curry",
    "カレー",
    [
      item("beef-sliced", 300),
      item("potato", 300),
      item("carrot", 150),
      item("onion", 300),
      item("curry-roux", 90),
    ],
    [
      {
        from: "beef-sliced",
        to: "pork-komagire",
        name: "ポークカレー",
        note: "豚こまで煮込み時間も短めに。",
      },
      {
        from: "beef-sliced",
        to: "chicken-thigh",
        name: "チキンカレー",
        note: "鶏肉のうまみで。",
      },
    ],
  ),
  recipe("oyakodon", "親子丼", [
    item("chicken-thigh", 300),
    item("egg", 3, "piece"),
    item("onion", 300),
    item("rice", 300),
  ]),
  recipe("shogayaki", "生姜焼き", [
    item("pork-komagire", 300),
    item("onion", 300),
    item("cabbage", 300),
  ]),
  recipe("chicken", "鶏の照り焼き", [
    item("chicken-thigh", 450),
    item("cabbage", 300),
    item("soy-sauce", 30, "ml"),
  ]),
  recipe("salmon", "鮭のホイル焼き", [
    item("salmon", 3, "piece"),
    item("onion", 300),
    item("carrot", 150),
  ]),
  recipe("mackerel", "さばの味噌煮", [
    item("mackerel", 3, "piece"),
    item("miso", 45),
  ]),
  recipe("tofu", "麻婆豆腐", [
    item("tofu", 600),
    item("pork-komagire", 150),
    item("soy-sauce", 30, "ml"),
  ]),
  recipe("fried-rice", "チャーハン", [
    item("rice", 450),
    item("egg", 3, "piece"),
    item("onion", 150),
  ]),
  recipe("pasta", "トマトパスタ", [
    item("pasta", 300),
    item("tomato", 450),
    item("onion", 150),
  ]),
  recipe("stirfry", "野菜炒め", [
    item("pork-komagire", 300),
    item("cabbage", 300),
    item("bean-sprout", 200),
  ]),
  recipe("omelet", "オムレツ", [
    item("egg", 6, "piece"),
    item("onion", 150),
    item("tomato", 150),
  ]),
  recipe("miso-soup", "味噌汁", [
    item("tofu", 300),
    item("spinach", 150),
    item("miso", 45),
  ]),
  recipe("hotpot", "寄せ鍋", [
    item("chicken-thigh", 300),
    item("tofu", 300),
    item("cabbage", 450),
  ]),
  recipe("spinach", "ほうれん草の卵炒め", [
    item("spinach", 300),
    item("egg", 3, "piece"),
  ]),
];
// 肉じゃがの調味料は家庭にある前提。購入対象は上記5材料。
export function seedProducts(now = new Date().toISOString()): Product[] {
  const packages: Record<string, [number, Unit, number]> = {
    "beef-sliced": [300, "g", 68000],
    "pork-komagire": [300, "g", 39000],
    "chicken-thigh": [300, "g", 42000],
    potato: [500, "g", 18000],
    carrot: [200, "g", 12000],
    onion: [500, "g", 15000],
    shirataki: [200, "g", 15000],
    cabbage: [500, "g", 18000],
    egg: [6, "piece", 24000],
    tofu: [300, "g", 9000],
    salmon: [3, "piece", 54000],
    mackerel: [3, "piece", 45000],
    spinach: [200, "g", 18000],
    "bean-sprout": [200, "g", 5000],
    tomato: [500, "g", 28000],
    rice: [1000, "g", 70000],
    pasta: [500, "g", 19000],
    "curry-roux": [150, "g", 21000],
    miso: [500, "g", 28000],
    "soy-sauce": [500, "ml", 20000],
  };
  return stores.flatMap((store, index) =>
    ingredients.map((ingredient) => {
      const [quantity, unit, base] = packages[ingredient.key];
      let priceMinor = base + (index === 2 ? 2000 : index === 3 ? -1000 : 0);
      if (index === 1 && ingredient.key === "beef-sliced") priceMinor = 50000;
      if (index === 1 && ingredient.key === "pork-komagire") priceMinor = 36000;
      const product: Product = {
        id: `${store.id}-${ingredient.key}`,
        storeId: store.id,
        name: ingredient.name,
        ingredientKey: ingredient.key,
        quantity,
        unit,
        priceMinor,
        stock: "in",
        source: "seed",
        updatedAt: now,
      };
      if (index === 0 && ingredient.key === "beef-sliced")
        product.stock = "out";
      if (index === 0 && ingredient.key === "pork-komagire")
        Object.assign(product, {
          salePriceMinor: 29000,
          saleStart: "2020-01-01T00:00:00.000Z",
          saleEnd: "2099-12-31T23:59:59.999Z",
          stock: "low",
        });
      if (
        index === 3 &&
        ["beef-sliced", "pork-komagire", "chicken-thigh"].includes(
          ingredient.key,
        )
      )
        product.stock = "unknown";
      return product;
    }),
  );
}
