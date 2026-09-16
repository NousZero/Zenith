import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./globals.css";
import { applyTheme, storedTheme } from "./themes";

// Before the first render, so the window never flashes the default palette.
applyTheme(storedTheme());

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Zenith renderer root is missing.");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
