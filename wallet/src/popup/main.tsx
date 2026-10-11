import "@/polyfills";
import "@fontsource/cal-sans/400.css";
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@/styles/globals.css";
import { App } from "./App";
import { initAnalytics } from "./lib/analytics";
import { applyUiSurfaceClass, readUiSurface } from "./lib/ui-shell";

// The dApp approval window is resizable, so it uses the fluid side-panel layout.
const isApprovalWindow = new URLSearchParams(location.search).has("approval");

void readUiSurface()
  .then((surface) => applyUiSurfaceClass(isApprovalWindow ? "sidepanel" : surface))
  .then(initAnalytics);

const THEME_KEY = "brume:theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pref = localStorage.getItem(THEME_KEY) ?? "system";
  const dark = pref === "dark" || (pref === "system" && mq.matches);
  document.documentElement.classList.toggle("dark", dark);
}
applyTheme();
mq.addEventListener("change", applyTheme);
window.addEventListener("storage", (e) => { if (e.key === THEME_KEY) applyTheme(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
