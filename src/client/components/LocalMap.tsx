import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { StorePlan } from "../../domain/types.js";
import { formatMoney } from "../../domain/money.js";
function fitPhone(map: L.Map, plans: StorePlan[], stage: boolean) {
  if (!stage && plans.length)
    map.fitBounds(
      L.latLngBounds(
        plans.map((p) => [p.store.lat, p.store.lng] as [number, number]),
      ),
      {
        paddingTopLeft: [58, 24],
        paddingBottomRight: [58, 46],
        maxZoom: 15,
        animate: false,
      },
    );
}
export function LocalMap({
  plans,
  center,
  onSelect,
  stage = false,
}: {
  plans: StorePlan[];
  center: [number, number];
  onSelect?: (id: string) => void;
  stage?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const [failed, setFailed] = useState(!navigator.onLine);
  useEffect(() => {
    if (failed || !ref.current) return;
    const map = L.map(ref.current, {
      zoomControl: !stage,
      dragging: !stage,
      scrollWheelZoom: false,
      zoomSnap: 0.1,
      doubleClickZoom: !stage,
      touchZoom: !stage,
      keyboard: !stage,
      attributionControl: true,
    }).setView(center, stage ? 15 : 14);
    mapRef.current = map;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" tabindex="-1">OpenStreetMap</a>',
      },
    ).addTo(map);
    tiles.on("tileerror", () => setFailed(true));
    const timer = setTimeout(() => {
      if (!ref.current?.querySelector(".leaflet-tile-loaded")) setFailed(true);
    }, 7000);
    const resize = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      fitPhone(map, plansRef.current, stage);
    });
    resize.observe(ref.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markers.current = [];
    };
  }, [failed, center[0], center[1], stage]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = plans.map((plan, index) => {
      const tag = document.createElement("span");
      tag.className = `price-tag ${index === 0 ? "best" : ""}`;
      const rank = document.createElement("span");
      rank.className = "tag-rank";
      rank.textContent = String(index + 1);
      tag.append(
        rank,
        document.createTextNode(formatMoney(plan.best.totalMinor)),
      );
      const icon = L.divIcon({
        className: "price-pin",
        html: tag,
        iconSize: [96, 30],
        iconAnchor: [48, 15],
      });
      const marker = L.marker([plan.store.lat, plan.store.lng], {
        icon,
        keyboard: !stage,
        interactive: !stage,
        title: plan.store.name,
        alt: `${plan.store.name} ${index + 1}位`,
      }).addTo(map);
      if (onSelect) marker.on("click", () => onSelect(plan.store.id));
      return marker;
    });
    fitPhone(map, plans, stage);
  }, [plans, failed, center[0], center[1], stage, onSelect]);
  return (
    <div className={`local-map ${stage ? "projection-map" : ""}`}>
      {failed ? (
        <div className="map-fallback">
          <strong>地図なし</strong>
          <p>回線がなくても比較できます</p>
          <ul>
            {plans.map((p) => (
              <li key={p.store.id}>
                {p.store.name}
                <span>徒歩{p.store.walkMinutes}分</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div ref={ref} className="map-canvas" aria-label="架空店舗の地図" />
      )}
      <span className="map-note">店舗・位置はすべて架空のデモデータです</span>
    </div>
  );
}
