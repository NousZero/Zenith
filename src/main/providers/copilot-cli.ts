import { execFile } from "node:child_process";

import type { Model } from "../../shared/types";
import { asRecord, parseJsonLine, type CliLineEvent, type CliToolSpec } from "../cli/cli-adapter";
import { withSystemPreamble } from "../cli/transcript";

const DEFAULT_MODELS: Model[] = [{ id: "default", label: "Auto" }];
const POLICY_MESSAGE =
  "GitHub Copilot blocked this request: your Copilot plan or organization policy doesn't allow Copilot CLI. Check github.com/settings/copilot.";
const SIGN_IN_MESSAGE = "Copilot CLI isn't signed in. Run `copilot login` in a terminal.";

function friendly(message: string): string {
  if (/access denied by policy/i.test(message)) return POLICY_MESSAGE;
  if (/not (logged|signed) in|authenticate|copilot login/i.test(message)) return SIGN_IN_MESSAGE;
  return message;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseCopilotLine(line: string): CliLineEvent | undefined {
  const event = parseJsonLine(line);
  if (!event) return undefined;
  const data = asRecord(event["data"]);

  switch (event["type"]) {
    case "assistant.message_delta": {
      const text = data?.["deltaContent"];
      return typeof text === "string" && text !== "" ? { delta: text } : undefined;
    }
    case "assistant.usage":
      return {
        usage: {
          inputTokens: tokenCount(data?.["inputTokens"]),
          outputTokens: tokenCount(data?.["outputTokens"]),
        },
      };
    case "session.error": {
      const message = data?.["message"];
      return {
        error: friendly(typeof message === "string" ? message : "Copilot CLI reported an error."),
      };
    }
    default:
      return undefined;
  }
}

// `copilot help config` lists the models the installed CLI accepts, one `- "id"` per line.
export function parseCopilotModelList(helpText: string): Model[] {
  const lines = helpText.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("`model`"));
  if (start === -1) return DEFAULT_MODELS;
  const models: Model[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s*-\s+"([^"]+)"\s*$/.exec(line);
    if (match?.[1]) models.push({ id: match[1], label: match[1] });
    else if (models.length > 0) break;
  }
  return [...DEFAULT_MODELS, ...models];
}

function readModelHelp(binaryPath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      binaryPath,
      ["help", "config"],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => resolve(error ? "" : stdout),
    );
  });
}

export const copilotCliSpec: CliToolSpec = {
  id: "copilot-cli",
  label: "Copilot CLI",

  async listModels(binaryPath) {
    if (!binaryPath) return DEFAULT_MODELS;
    return parseCopilotModelList(await readModelHelp(binaryPath));
  },

  buildInvocation(model, prompt) {
    // ponytail: Copilot only takes the prompt as an argument; Linux caps one argument near 128 KB.
    const args = [
      `--prompt=${withSystemPreamble(prompt)}`,
      "--output-format",
      "json",
      "--stream",
      "on",
      "--available-tools=",
      "--no-ask-user",
      "--no-custom-instructions",
      "--disable-builtin-mcps",
      "--no-color",
      "--no-auto-update",
    ];
    if (model) args.push(`--model=${model}`);
    return { args, stdin: "" };
  },

  parseLine: parseCopilotLine,

  describeFailure(exit) {
    const firstLine = exit.stderr
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    return friendly(firstLine ?? `Copilot CLI exited with code ${exit.exitCode ?? "unknown"}.`);
  },
};
