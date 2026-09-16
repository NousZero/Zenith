// Providers the user adds with their own address and key, as OpenCode and Hermes Agent allow.

export type ProviderApi = "openai" | "anthropic";

export interface CustomProvider {
  // "custom:<slug>"
  id: string;
  name: string;
  api: ProviderApi;
  baseUrl: string;
  // Model IDs to offer; empty means ask the server for its list.
  models: string[];
  // Whether an API key is saved for it (never the key itself).
  hasKey: boolean;
}

export interface CustomProviderInput {
  id?: string;
  name: string;
  api: ProviderApi;
  baseUrl: string;
  models: string[];
  // Empty keeps the saved key; null removes it.
  apiKey: string | null;
}

export const PROVIDER_PRESETS: readonly { name: string; api: ProviderApi; baseUrl: string }[] = [
  { name: "OpenAI", api: "openai", baseUrl: "https://api.openai.com/v1" },
  { name: "Anthropic", api: "anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { name: "OpenRouter", api: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  {
    name: "Google Gemini",
    api: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  { name: "Groq", api: "openai", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "DeepSeek", api: "openai", baseUrl: "https://api.deepseek.com/v1" },
  { name: "Mistral", api: "openai", baseUrl: "https://api.mistral.ai/v1" },
  { name: "xAI", api: "openai", baseUrl: "https://api.x.ai/v1" },
  { name: "Together AI", api: "openai", baseUrl: "https://api.together.xyz/v1" },
  { name: "Custom", api: "openai", baseUrl: "" },
];

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "provider"
  );
}

// Checks user input and returns the normalized base URL, or throws a readable message.
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("The base URL must be a full address such as https://api.example.com/v1.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The base URL must start with https:// or http://.");
  }
  // Plain http is only reasonable for servers on this computer or the local network.
  if (
    url.protocol === "http:" &&
    !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^.]+\.local$)/.test(
      url.hostname,
    )
  ) {
    throw new Error(
      "Use https:// for servers outside this computer or local network, so the API key isn't sent unencrypted.",
    );
  }
  if (url.username || url.password)
    throw new Error("Put the API key in the key field, not the URL.");
  return trimmed;
}
