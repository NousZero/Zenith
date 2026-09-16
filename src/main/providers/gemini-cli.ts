import type { Model } from "../../shared/types";
import { asRecord, parseJsonLine, type CliLineEvent, type CliToolSpec } from "../cli/cli-adapter";
import { withSystemPreamble } from "../cli/transcript";

const MODELS: Model[] = [
  { id: "default", label: "Default" },
  { id: "auto", label: "Auto" },
  { id: "pro", label: "Pro" },
  { id: "flash", label: "Flash" },
  { id: "flash-lite", label: "Flash Lite" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
];

const EXIT_AUTH_NOT_CONFIGURED = 41;
const SIGN_IN_MESSAGE = "Gemini CLI isn't signed in. Run `gemini` in a terminal once to sign in.";

// Gemini nests the upstream API error as a JSON string inside error.message.
export function innermostErrorMessage(raw: string): string {
  const matches = [...raw.matchAll(/message\\*"\s*:\s*\\*"((?:[^"\\]|\\(?!"))+)/g)];
  const inner = matches.at(-1)?.[1]?.replace(/\\n/g, " ").trim();
  if (inner && !inner.startsWith("{")) return inner;
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

function friendly(message: string): string {
  if (/API key not valid|auth method|not authenticated|login required/i.test(message)) {
    return SIGN_IN_MESSAGE;
  }
  return message;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseGeminiLine(line: string): CliLineEvent | undefined {
  const event = parseJsonLine(line);
  if (!event) return undefined;

  if (event["type"] === "message" && event["role"] === "assistant" && event["delta"] === true) {
    const content = event["content"];
    return typeof content === "string" && content !== "" ? { delta: content } : undefined;
  }

  if (event["type"] === "result") {
    const result: CliLineEvent = {};
    const stats = asRecord(event["stats"]);
    if (stats) {
      result.usage = {
        inputTokens: tokenCount(stats["input_tokens"]),
        outputTokens: tokenCount(stats["output_tokens"]),
      };
    }
    if (event["status"] === "error") {
      const message = asRecord(event["error"])?.["message"];
      result.error = friendly(
        typeof message === "string"
          ? innermostErrorMessage(message)
          : "Gemini CLI reported an error.",
      );
    }
    return result;
  }

  if (event["type"] === "error" && event["severity"] === "error") {
    const message = event["message"];
    return {
      error: friendly(typeof message === "string" ? message : "Gemini CLI reported an error."),
    };
  }

  return undefined;
}

export const geminiCliSpec: CliToolSpec = {
  id: "gemini-cli",
  label: "Gemini CLI",

  async listModels() {
    return MODELS;
  },

  buildInvocation(model, prompt) {
    // The prompt travels on stdin; `-p " "` only switches Gemini into headless mode.
    // --skip-trust is required or Gemini silently overrides plan mode in untrusted folders.
    const args = ["-p", " ", "-o", "stream-json", "--approval-mode", "plan", "--skip-trust"];
    if (model) args.push("-m", model);
    return { args, stdin: withSystemPreamble(prompt) };
  },

  parseLine: parseGeminiLine,

  describeFailure(exit) {
    if (exit.exitCode === EXIT_AUTH_NOT_CONFIGURED || /auth method/i.test(exit.stderr)) {
      return SIGN_IN_MESSAGE;
    }
    return `Gemini CLI exited with code ${exit.exitCode ?? "unknown"}.`;
  },
};
