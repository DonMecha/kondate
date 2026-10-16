import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "../useSession.js";
import { api, type Config } from "../api.js";
import { formatMoney } from "../../domain/money.js";
import { LocalMap } from "../components/LocalMap.js";
import { PriceTag } from "../components/PriceTag.js";
import { SaleBadge } from "../components/SaleBadge.js";
import { StatusChip } from "../components/StatusChip.js";
import { swapSummary } from "../components/SwapCard.js";
function CountPrice({ value }: { value: number }) {
  const [shown, setShown] = useState(value),
    previous = useRef(value);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      from === value
    ) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      cancelAnimationFrame(frame);
      setShown(value);
    };
    preference.addEventListener("change", stop);
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / 900);
      setShown(
        progress === 1
          ? value
          : Math.round(
              (from + (value - from) * (1 - Math.pow(1 - progress, 3))) / 100,
            ) * 100,
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", stop);
    };
  }, [value]);
  return (
    <span className="count-price" data-final={value}>
      {formatMoney(shown)}
    </span>
  );
}
function QR() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="stage-qr">
      {failed ? (
        <span>
          QRを表示できません
          <br />
          サーバーの接続を確認してください
        </span>
      ) : (
        <img
          src="/api/session/qr"
          alt="会場のスマホ接続用QRコード"
          onError={() => setFailed(true)}
        />
      )}
      <span>
        スマホから参加
        <br />
        <b>すべて架空データ</b>
      </span>
    </div>
  );
}
export function Stage() {
  const session = useSession();
  const [config, setConfig] = useState<Config>();
  const [flash, setFlash] = useState("");
  const board = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<string, number>());
  useEffect(() => {
    api<Config>("/api/config")
      .then(setConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (preference.matches)
        board.current
          ?.querySelectorAll(".stage-row")
          .forEach((row) =>
            row.getAnimations().forEach((animation) => animation.cancel()),
          );
    };
    preference.addEventListener("change", stop);
    return () => preference.removeEventListener("change", stop);
  }, []);
  useLayoutEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    board.current
      ?.querySelectorAll<HTMLElement>(".stage-row")
      .forEach((row) => {
        // offsetTop is independent of any still-running FLIP transform.
        const top = row.offsetTop,
          before = positions.current.get(row.dataset.store!);
        next.set(row.dataset.store!, top);
        if (!reduced && before !== undefined && before !== top)
          row.animate(
            [
              { transform: `translateY(${before - top}px)` },
              { transform: "none" },
            ],
            { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
      });
    positions.current = next;
  }, [session.plan]);
  useEffect(() => {
    if (!session.captureEvent) return;
    setFlash(session.captureEvent.storeId);
    const timer = setTimeout(() => setFlash(""), 1800);
    return () => clearTimeout(timer);
  }, [session.captureEvent]);
  return (
    <main className="stage-screen">
      <header className="stage-heading">
        <div>
          <h1>{session.plan?.intent.dish ?? "今夜、何を作ろう。"}</h1>
          <p>
            {session.plan
              ? `${session.plan.intent.servings}人分 ・ ${formatMoney(session.plan.intent.budgetMinor)}以内`
              : "kondate ・ 会場デモ"}
          </p>
        </div>
        <div
          className={`live ${session.connected ? "" : "disconnected"}`}
          role="status"
        >
          <i />
          {session.connected ? "LIVE" : "再接続中"}
        </div>
      </header>
      {session.error && (
        <p role="alert" className="feedback error">
          {session.error}
        </p>
      )}
      {session.plan ? (
        <div className="stage-body">
          {config ? (
            <LocalMap
              stage
              plans={session.plan.stores}
              center={config.mapCenter}
            />
          ) : (
            <div className="map-fallback">地図の準備中…</div>
          )}
          <div className="stage-board" ref={board} aria-label="店舗の順位">
            {session.plan.stores.map((p, index) => (
              <article
                key={p.store.id}
                data-store={p.store.id}
                data-rank={index + 1}
                className={`stage-row ${flash === p.store.id ? "flash" : ""}`}
              >
                {index === 0 && <span className="best-label">BEST</span>}
                <span aria-hidden="true" className="stage-rank num">
                  {index + 1}
                </span>
                <div className="stage-store">
                  <h2>{p.store.name}</h2>
                  <div className="stage-meta">
                    <StatusChip offer={p.best} />
                    {p.best.lines.some((l) => l.sale) && <SaleBadge />}
                    {p.best.lines.some((l) =>
                      l.purchases.some((v) => v.product.source === "photo"),
                    ) && <PriceTag>写真で更新</PriceTag>}
                  </div>
                  <p>{swapSummary(p.best, p)}</p>
                </div>
                <div className="stage-total num">
                  <CountPrice value={p.best.totalMinor} />
                  <small>
                    {index + 1}位 ・ {p.best.complete ? "税込" : "参考額"} ・
                    徒歩{p.store.walkMinutes}分
                  </small>
                </div>
              </article>
            ))}
            {!session.plan.stores.length && (
              <p>
                条件に合う店舗がありません。スマホから依頼を変えてください。
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="stage-waiting">
          <div className="brand">
            <i />
            kondate
          </div>
          <h2>
            スマホから今夜の献立を
            <br />
            送ってください
          </h2>
          <p>献立を店に合わせて、組み替える。</p>
        </div>
      )}
      <footer className="stage-footer">
        <div className="event-area" aria-live="polite">
          <span className="event-label">出来事</span>
          {session.event ? (
            <p className="event-pill" key={session.event.sequence}>
              <span
                className={`event-icon ${session.event.kind === "capture" ? "photo" : ""}`}
                aria-hidden="true"
              >
                {session.event.kind === "capture" ? "↳" : "→"}
              </span>
              {session.event.text}
            </p>
          ) : (
            <p className="event-pill">依頼を待っています</p>
          )}
        </div>
        <QR />
      </footer>
    </main>
  );
}
