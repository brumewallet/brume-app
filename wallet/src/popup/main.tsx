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
import { applyUiSurfaceClass, readUiSurface } from "./lib/ui-shell";

void readUiSurface().then(applyUiSurfaceClass);

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
