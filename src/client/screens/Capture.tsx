import { useEffect, useState } from "react";
import type {
  CaptureCandidate,
  PriceCapture,
  Store,
} from "../../domain/types.js";
import { api, type Config } from "../api.js";
import { StickyCTA } from "../components/StickyCTA.js";
const empty: CaptureCandidate = {
  name: "",
  ingredientKey: "pork-komagire",
  priceYen: "",
  tax: "unknown",
  taxRate: 8,
  quantity: 300,
  unit: "g",
  stock: "unknown",
  confidence: 0,
  sale: false,
  saleStart: null,
  saleEnd: null,
};
export function Capture({
  config,
  stores,
  initialStore,
  onSaved,
}: {
  config: Config;
  stores: Store[];
  initialStore: string;
  onSaved: () => void;
}) {
  const [store, setStore] = useState(initialStore || "s2"),
    [file, setFile] = useState<File>();
  const [preview, setPreview] = useState(""),
    [capture, setCapture] = useState<PriceCapture>();
  const [candidate, setCandidate] = useState<CaptureCandidate>(empty);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (busy !== "read") return;
    setSeconds(0);
    const start = performance.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  const change = (key: keyof CaptureCandidate, value: unknown) =>
    setCandidate((v) => ({ ...v, [key]: value }));
  async function upload() {
    if (!file) return;
    setBusy("read");
    setError("");
    try {
      const form = new FormData();
      form.set("storeId", store);
      form.set("image", file);
      const next = await api<PriceCapture>("/api/captures", form);
      setCapture(next);
      setCandidate(next.candidates[0] ?? { ...empty });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!capture) return;
    setBusy("save");
    setError("");
    try {
      await api(`/api/captures/${capture.id}/confirm`, { candidate });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const confidence =
    config.provider !== "scripted" &&
    capture &&
    capture.candidates.length > 0 ? (
      <span className={`confidence ${candidate.confidence < 0.8 ? "low" : ""}`}>
        確信度 {Math.round(candidate.confidence * 100)}%
      </span>
    ) : null;
  return (
    <section className="capture-screen">
      <div className="section-title">
        <h1>値札を撮る</h1>
        <label className="capture-store">
          <span className="sr-only">撮影した店</span>
          <select
            value={store}
            disabled={Boolean(capture || busy)}
            onChange={(e) => setStore(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="finder">
        {preview ? (
          <img src={preview} alt="確認用の値札画像" />
        ) : (
          <span>カメラで撮影 ／ 画像を選択</span>
        )}
        <i className="corner c1" />
        <i className="corner c2" />
        <i className="corner c3" />
        <i className="corner c4" />
        {busy === "read" && (
          <>
            <span className="scan" />
            <span className="scan-status" role="status">
              読み取り中… {seconds}秒
            </span>
          </>
        )}
      </div>
      {!capture && (
        <>
          <label className="file-select">
            値札の画像
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={Boolean(busy)}
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setError("");
              }}
            />
          </label>
          <button
            className="primary full"
            onClick={() => void upload()}
            disabled={!file || Boolean(busy)}
          >
            {busy ? "読み取り中…" : "値札を読み取る"}
          </button>
          <p className="footnote">
            JPEG・PNG・WebP、8MBまで。位置情報を除去し、選択したAI提供元へ送ります。
          </p>
        </>
      )}
      {config.provider === "scripted" && (
        <p className="feedback warning">台本データで、画像は読んでいません</p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {capture && (
        <form
          id="confirm-capture"
          onSubmit={(e) => void save(e)}
          className="read-card"
        >
          <h2>
            {config.provider === "scripted"
              ? "台本の候補を確認"
              : capture.candidates.length
                ? "AIが読み取りました"
                : "読み取れませんでした"}
            {confidence}
          </h2>
          {capture.warning && config.provider !== "scripted" && (
            <p className="feedback warning">{capture.warning}</p>
          )}
          {!capture.candidates.length && <p>下の欄へ手入力できます。</p>}
          {capture.candidates.length > 1 && (
            <label className="field">
              候補
              <select
                onChange={(e) =>
                  setCandidate(capture.candidates[Number(e.target.value)])
                }
              >
                {capture.candidates.map((c, i) => (
                  <option key={i} value={i}>
                    {c.name} {c.priceYen}円
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            商品
            <input
              required
              maxLength={100}
              value={candidate.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label className="field">
            材料
            <select
              value={candidate.ingredientKey}
              onChange={(e) => change("ingredientKey", e.target.value)}
            >
              {config.ingredients.map((i) => (
                <option value={i.key} key={i.key}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            価格（円）
            <input
              className="num"
              aria-label="表示価格（円）"
              required
              inputMode="decimal"
              value={candidate.priceYen}
              onChange={(e) => change("priceYen", e.target.value)}
            />
          </label>
          <label className="field">
            税区分
            <select
              value={candidate.tax}
              onChange={(e) => change("tax", e.target.value)}
            >
              <option value="unknown">不明（反映不可）</option>
              <option value="included">税込</option>
              <option value="excluded">税別</option>
            </select>
          </label>
          {candidate.tax === "excluded" && (
            <label className="field">
              消費税率
              <select
                value={candidate.taxRate}
                onChange={(e) => change("taxRate", Number(e.target.value))}
              >
                <option value={8}>8%</option>
                <option value={10}>10%</option>
              </select>
            </label>
          )}
          <div className="field">
            <label htmlFor="quantity">内容量</label>
            <div className="quantity-fields">
              <input
                id="quantity"
                type="number"
                min="1"
                max="100000"
                required
                value={candidate.quantity}
                onChange={(e) => change("quantity", Number(e.target.value))}
              />
              <select
                aria-label="単位"
                value={candidate.unit}
                onChange={(e) => change("unit", e.target.value)}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="piece">個</option>
              </select>
            </div>
          </div>
          <fieldset className="stock-field">
            <legend>確認できた在庫</legend>
            <div className="segments">
              {(
                [
                  ["unknown", "不明"],
                  ["in", "あり"],
                  ["low", "少"],
                  ["out", "なし"],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="stock"
                    value={value}
                    checked={candidate.stock === value}
                    onChange={() => change("stock", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="footnote">
            分からなければ「不明」のまま。在庫は推測しません。
          </p>
          <details className="sale-fields">
            <summary>特売として保存する</summary>
            <label className="check-label">
              <input
                type="checkbox"
                checked={candidate.sale}
                onChange={(e) => change("sale", e.target.checked)}
              />
              特売価格
            </label>
            {candidate.sale &&
              (["saleStart", "saleEnd"] as const).map((key, i) => (
                <label className="date-field" key={key}>
                  特売{i === 0 ? "開始" : "終了"}
                  <input
                    type="datetime-local"
                    required
                    value={
                      candidate[key]
                        ? new Date(
                            Date.parse(candidate[key]!) -
                              new Date().getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      change(
                        key,
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      )
                    }
                  />
                </label>
              ))}
          </details>
          <button
            type="button"
            className="outline full"
            disabled={Boolean(busy)}
            onClick={() => {
              setCapture(undefined);
              setFile(undefined);
            }}
          >
            別の写真を選ぶ
          </button>
          <StickyCTA
            form="confirm-capture"
            yellow
            disabled={Boolean(busy) || candidate.tax === "unknown"}
            end="→ 投影画面へ"
          >
            {busy ? "反映中…" : "確認して反映"}
          </StickyCTA>
        </form>
      )}
    </section>
  );
}
