import { readFileSync } from "node:fs";
import { join } from "node:path";

// Gemini CLI reads an API key from ~/.gemini/.env itself, but only when a session opens for a
// folder, which is too late for ACP's authenticate step. So for Gemini alone, Zenith reads that
// same file and hands the key to the Gemini process's environment, unless one is already set.
// The key is never logged, stored, or sent anywhere else.
const KEY_NAMES = ["GEMINI_API_KEY", "GOOGLE_API_KEY"] as const;

export function geminiKeyEnv(home: string, env: NodeJS.ProcessEnv): Record<string, string> {
  if (KEY_NAMES.some((name) => (env[name] ?? "") !== "")) return {};
  let text: string;
  try {
    text = readFileSync(join(home, ".gemini", ".env"), "utf8");
  } catch {
    return {};
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    const value = match?.[2]?.replace(/^(['"])(.*)\1$/, "$2");
    if (match?.[1] && value) return { [match[1]]: value };
  }
  return {};
}

// Gemini over ACP needs to be told to use a key, or it falls back to Google Cloud credentials.
export function geminiSignIn(env: NodeJS.ProcessEnv): string | undefined {
  return KEY_NAMES.some((name) => (env[name] ?? "") !== "") ? "gemini-api-key" : undefined;
}
