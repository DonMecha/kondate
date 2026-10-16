import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import type { CaptureEvent, SessionSnapshot } from "../domain/session.js";
export function useSession() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({
    plan: null,
    event: null,
    sequence: -1,
  });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [captureEvent, setCaptureEvent] = useState<CaptureEvent>();
  const sequence = useRef(-1);
  useEffect(() => {
    let active = true,
      source: EventSource | undefined;
    function apply(next: SessionSnapshot) {
      if (!active || next.sequence < sequence.current) return;
      sequence.current = next.sequence;
      setSnapshot(next);
      setError("");
    }
    api<SessionSnapshot>("/api/session/current")
      .then(apply)
      .catch((e) => {
        if (active) setError(e.message);
      });
    function connect() {
      source?.close();
      source = new EventSource("/api/events");
      source.onopen = () => setConnected(true);
      source.onerror = () => setConnected(false);
      // 初回・再接続時のsessionは全状態。欠落したイベントを再生せず復元する。
      source.addEventListener("session", (e) => {
        const next = JSON.parse(e.data);
        sequence.current = next.sequence;
        setCaptureEvent(undefined);
        apply(next);
      });
      for (const name of ["plan", "suggestion", "capture"])
        source.addEventListener(name, (e) => {
          const next = JSON.parse(e.data);
          if (next.sequence < sequence.current) return;
          apply(next);
          if (name === "capture") setCaptureEvent(next);
          else if (name === "plan") setCaptureEvent(undefined);
        });
    }
    function offline() {
      source?.close();
      setConnected(false);
    }
    if (navigator.onLine) connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", connect);
    return () => {
      active = false;
      source?.close();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", connect);
    };
  }, []);
  return { ...snapshot, connected, error, captureEvent };
}
