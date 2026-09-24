import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import "./globals.css";
import { applyTheme, storedTheme } from "./themes";

// Before the first render, so the window never flashes the default palette.
applyTheme(storedTheme());
// macOS gets the native window chrome (see createMainWindowOptions): the sidebar is translucent
// over the system material and the top bar makes room for the traffic lights.
if (navigator.userAgent.includes("Mac")) document.documentElement.dataset["platform"] = "mac";

// Nothing else here catches these: forward them to the local error log in main.
window.onerror = (message, source, lineno, colno, error) => {
  void window.zenith.log.report(String(message), error?.stack ?? `${source}:${lineno}:${colno}`);
};
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as unknown;
  void window.zenith.log.report(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack : undefined,
  );
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Zenith renderer root is missing.");

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
