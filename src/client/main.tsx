import { createRoot } from "react-dom/client";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/zen-kaku-gothic-new/900.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/700.css";
import "@fontsource/inter-tight/800.css";
import "@fontsource/inter-tight/900.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { Phone } from "./screens/Phone.js";
import { Stage } from "./screens/Stage.js";
createRoot(document.getElementById("root")!).render(
  location.pathname === "/stage" ? <Stage /> : <Phone />,
);
