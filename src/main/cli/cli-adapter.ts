import type {
  ChatChunk,
  Model,
  ProviderAdapter,
  SendMessageRequest,
  TokenUsage,
} from "../../shared/types";
import { runCli, type CliExit } from "./run-cli";
import { assertSafeModelId, buildCliPrompt, type CliPrompt } from "./transcript";

export const DEFAULT_MODEL_ID = "default";

export interface CliLineEvent {
  delta?: string;
  usage?: TokenUsage;
  error?: string;
  contextWindow?: number;
  contextUsage?: TokenUsage;
}

export interface CliInvocation {
  args: string[];
  stdin: string;
  // Extra environment for this tool only.
  env?: NodeJS.ProcessEnv;
}

export interface CliToolSpec {
  id: string;
  label: string;
  listModels(binaryPath: string | undefined): Promise<Model[]>;
  buildInvocation(model: string | undefined, prompt: CliPrompt): CliInvocation;
  parseLine(line: string): CliLineEvent | undefined;
  describeFailure(exit: CliExit): string;
}

export interface CliAdapterDeps {
  resolveBinary(): Promise<string | undefined>;
  childEnv(binaryPath: string): NodeJS.ProcessEnv;
  cwd: string;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return undefined;
  }
}

export function lastNonEmptyLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

export function createCliAdapter(spec: CliToolSpec, deps: CliAdapterDeps): ProviderAdapter {
  return {
    id: spec.id,

    async listModels(): Promise<Model[]> {
      return spec.listModels(await deps.resolveBinary());
    },

    async validateCredential(): Promise<boolean> {
      return (await deps.resolveBinary()) !== undefined;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const binary = await deps.resolveBinary();
      if (!binary) throw new Error(`${spec.label} isn't installed on this computer.`);
      const model = req.model === DEFAULT_MODEL_ID ? undefined : assertSafeModelId(req.model);
      const invocation = spec.buildInvocation(model, buildCliPrompt(req.messages));

      const run = runCli({
        command: binary,
        args: invocation.args,
        cwd: deps.cwd,
        env: { ...deps.childEnv(binary), ...invocation.env },
        stdin: invocation.stdin,
        ...(req.signal ? { signal: req.signal } : {}),
      });

      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      let hasUsage = false;
      let receivedText = false;
      let streamError: string | undefined;
      let contextWindow: number | undefined;
      let contextUsage: TokenUsage | undefined;

      try {
        for await (const line of run.lines) {
          const event = spec.parseLine(line);
          if (!event) continue;
          if (event.error !== undefined) streamError ??= event.error;
          if (event.contextWindow) contextWindow = event.contextWindow;
          if (event.contextUsage) contextUsage = event.contextUsage;
          if (event.usage) {
            usage.inputTokens += event.usage.inputTokens;
            usage.outputTokens += event.usage.outputTokens;
            hasUsage = true;
          }
          if (event.delta) {
            receivedText = true;
            yield { delta: event.delta, done: false };
          }
        }

        const exit = await run.exit;
        if (exit.aborted) return;
        if (!receivedText) {
          if (streamError !== undefined) throw new Error(streamError);
          if (exit.exitCode !== 0) throw new Error(spec.describeFailure(exit));
        }
        yield {
          delta: "",
          done: true,
          ...(hasUsage ? { usage } : {}),
          ...(contextWindow ? { contextWindow } : {}),
          ...(contextUsage ? { contextUsage } : {}),
        };
      } finally {
        run.kill();
      }
    },
  };
}
