// Color themes; the palettes live in globals.css under :root[data-theme="…"].

export const THEMES = [
  // The id stays "graphite" so a saved choice carries over to the new default look.
  {
    id: "graphite",
    label: "Carbon",
    scheme: "dark",
    swatches: ["#171717", "#7d72f5", "#5fd08a"],
  },
  {
    id: "amber",
    label: "Amber",
    scheme: "dark",
    swatches: ["#0d0f0e", "#d3a553", "#a7b69a"],
  },
  {
    id: "midnight",
    label: "Midnight",
    scheme: "dark",
    swatches: ["#0f1218", "#2563eb", "#4ade80"],
  },
  { id: "nord", label: "Nord", scheme: "dark", swatches: ["#23272f", "#88c0d0", "#a3be8c"] },
  {
    id: "solarized",
    label: "Solarized",
    scheme: "dark",
    swatches: ["#002b36", "#d6a100", "#8aa51c"],
  },
  { id: "rose", label: "Rosé", scheme: "dark", swatches: ["#191724", "#ebbcba", "#9ccfd8"] },
  {
    id: "parchment",
    label: "Parchment",
    scheme: "light",
    swatches: ["#f7f3ea", "#94621a", "#4a6b2e"],
  },
  { id: "paper", label: "Paper", scheme: "light", swatches: ["#fafafa", "#1f5fd6", "#1d7040"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "zenith.theme";

export function storedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : "graphite";
  } catch {
    return "graphite";
  }
}

export function applyTheme(id: ThemeId): void {
  // Switch every color at once instead of letting hover transitions fade between palettes.
  const root = document.documentElement;
  root.classList.add("theme-switching");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching")),
  );
  if (id === "graphite") delete document.documentElement.dataset["theme"];
  else document.documentElement.dataset["theme"] = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // The choice still applies for this window.
  }
}
