import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { api, type Config } from "../api.js";
import { useSession } from "../useSession.js";
import type { Offer, Store } from "../../domain/types.js";
import { formatMoney } from "../../domain/money.js";
import { ReceiptCard } from "../components/ReceiptCard.js";
import { StickyCTA } from "../components/StickyCTA.js";
import { LocalMap } from "../components/LocalMap.js";
import { Capture } from "./Capture.js";
import { ShoppingList } from "./ShoppingList.js";
export function Phone() {
  const session = useSession();
  const [config, setConfig] = useState<Config>(),
    [stores, setStores] = useState<Store[]>([]);
  const [text, setText] = useState("今夜は肉じゃが、3人分、2,000円以内");
  const [tab, setTab] = useState<"plan" | "capture" | "list">("plan");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null),
    [selectedStore, setSelectedStore] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({}),
    [captureStore, setCaptureStore] = useState("s2");
  const recognition = useRef<any>(null);
  const speechAvailable = Boolean(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition,
  );
  useEffect(() => {
    Promise.all([api<Config>("/api/config"), api<Store[]>("/api/stores")])
      .then(([c, s]) => {
        setConfig(c);
        setStores(s);
      })
      .catch((e) => setError(e.message));
    return () => recognition.current?.abort();
  }, []);
  const plan = session.plan;
  const current =
    plan?.stores.find((p) => p.store.id === selectedStore) ?? plan?.stores[0];
  const chosenOffer = (id: string): Offer | undefined => {
    const p = plan?.stores.find((s) => s.store.id === id);
    return (
      p &&
      ([p.original, ...p.alternatives].find((o) => o.id === choices[id]) ??
        p.best)
    );
  };
  const offer = current && chosenOffer(current.store.id);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/plan", { text });
      setExpanded(null);
      setSelectedStore("");
      setChoices({});
      setTab("plan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!window.confirm("写真・価格・買い物チェックを初期状態へ戻しますか？"))
      return;
    setBusy(true);
    setError("");
    try {
      await api("/api/reset", {});
      setChoices({});
      setSelectedStore("");
      setTab("plan");
      localStorage.removeItem("kondate-checks");
      setNotice("初期状態に戻しました。デモをもう一度始められます。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function speech() {
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    recognition.current?.abort();
    const next = new Recognition();
    recognition.current = next;
    next.lang = "ja-JP";
    next.onresult = (e: any) => setText(e.results[0][0].transcript);
    next.onerror = () =>
      setError("音声を取得できませんでした。文字で入力してください。");
    next.start();
  }
  function navigate(next: typeof tab) {
    setTab(next);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0 });
  }
  return (
    <>
      <header className="site-header">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("plan");
          }}
        >
          <i />
          kondate
        </a>
        <div className="header-tools">
          <span className="demo-pill">架空データ</span>
          <span className="provider">{config?.provider ?? "接続中"}</span>
          <button
            className="reset-button"
            disabled={busy}
            onClick={() => void reset()}
          >
            データを戻す
          </button>
        </div>
      </header>
      <div className="phone-shell">
        <nav className="tabs" aria-label="画面">
          <button
            aria-current={tab === "plan" ? "page" : undefined}
            onClick={() => navigate("plan")}
          >
            献立から探す
          </button>
          <button
            aria-current={tab === "capture" ? "page" : undefined}
            onClick={() => navigate("capture")}
          >
            値札を撮る
          </button>
          <button
            aria-current={tab === "list" ? "page" : undefined}
            onClick={() => navigate("list")}
          >
            買い物リスト
          </button>
        </nav>
        {(error || session.error) && (
          <p className="feedback error" role="alert">
            {error || session.error}
          </p>
        )}
        {notice && (
          <p role="status" className="feedback notice">
            {notice}
          </p>
        )}
        <main>
          {tab === "plan" && (
            <>
              <form className="request-form" onSubmit={(e) => void submit(e)}>
                <label className="sr-only" htmlFor="request">
                  今夜の献立と条件
                </label>
                <div className="request-box">
                  <input
                    id="request"
                    value={text}
                    required
                    maxLength={1000}
                    onChange={(e) => setText(e.target.value)}
                  />
                  {speechAvailable && (
                    <button
                      type="button"
                      className="mic-button"
                      aria-label="音声入力"
                      onClick={speech}
                    >
                      <Mic size={18} />
                    </button>
                  )}
                  <button
                    className="send-button"
                    aria-label="献立を提案"
                    disabled={busy}
                  >
                    →
                  </button>
                </div>
                <div className="examples">
                  {[
                    "肉じゃが、3人分、2,000円以内",
                    "カレー、4人分、2,500円以内",
                  ].map((v) => (
                    <button type="button" key={v} onClick={() => setText(v)}>
                      {v}
                    </button>
                  ))}
                </div>
              </form>
              <ol className="progress" aria-label="進み具合">
                {["依頼", "比較", "リスト"].map((v, i) => (
                  <li
                    key={v}
                    className={i === 0 || (i === 1 && plan) ? "on" : ""}
                  >
                    <span>{v}</span>
                  </li>
                ))}
              </ol>
              {busy && (
                <p role="status" className="feedback notice">
                  近くの店に合わせて考えています…
                </p>
              )}
              {plan?.warning && (
                <p className="feedback warning">{plan.warning}</p>
              )}
              {plan ? (
                <section className="comparison">
                  <div className="section-title">
                    <h1>今夜のお買い物先</h1>
                    <span>揃う → 予算内 → 安い順</span>
                  </div>
                  <p className="plan-condition">
                    {plan.intent.dish} ・ {plan.intent.servings}人分 ・{" "}
                    {formatMoney(plan.intent.budgetMinor)}以内
                  </p>
                  {config && (
                    <LocalMap
                      plans={plan.stores}
                      center={config.mapCenter}
                      onSelect={(id) => {
                        setSelectedStore(id);
                        setExpanded(id);
                        document
                          .getElementById(`store-${id}`)
                          ?.scrollIntoView({ block: "start" });
                      }}
                    />
                  )}
                  <div className="receipts">
                    {plan.stores.map((p, i) => (
                      <div id={`store-${p.store.id}`} key={p.store.id}>
                        <ReceiptCard
                          plan={p}
                          offer={chosenOffer(p.store.id)!}
                          expanded={
                            expanded === null
                              ? i === 0
                              : expanded === p.store.id
                          }
                          onOpen={() => {
                            setExpanded(
                              (
                                expanded === null
                                  ? i === 0
                                  : expanded === p.store.id
                              )
                                ? ""
                                : p.store.id,
                            );
                            setSelectedStore(p.store.id);
                          }}
                          onOffer={(o) => {
                            setChoices((v) => ({ ...v, [p.store.id]: o.id }));
                            setSelectedStore(p.store.id);
                          }}
                          onCapture={() => {
                            setCaptureStore(p.store.id);
                            navigate("capture");
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  {!plan.stores.length && (
                    <p>条件に合う店舗がありません。依頼を変えてください。</p>
                  )}
                  {offer && (
                    <StickyCTA
                      onClick={() => navigate("list")}
                      end={`${formatMoney(offer.totalMinor)} →`}
                    >
                      この店で買う
                    </StickyCTA>
                  )}
                </section>
              ) : (
                <section className="empty-state">
                  <h1>
                    今夜の献立から、
                    <br />
                    お買い物先まで。
                  </h1>
                  <p>
                    店の在庫と値段に合わせて、
                    <br />
                    いつもの献立を組み替えます。
                  </p>
                  <p className="footnote">
                    料理・人数・予算を入力して始めてください。
                    <br />
                    すべて架空のデータで動くデモです。
                  </p>
                </section>
              )}
            </>
          )}
          {tab === "capture" && config && (
            <Capture
              config={config}
              stores={stores}
              initialStore={captureStore}
              onSaved={() => {
                setSelectedStore("");
                setChoices({});
                setExpanded(null);
                navigate("plan");
                setNotice("写真で更新された価格を反映しました。");
              }}
            />
          )}
          {tab === "list" && <ShoppingList offer={offer} plan={plan} />}
        </main>
      </div>
    </>
  );
}
