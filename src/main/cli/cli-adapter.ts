import type {
  ChatChunk,
  Model,
  ProviderAdapter,
  SendMessageRequest,
  TokenUsage,
} from "../../shared/types";
import { runCli, type CliExit } from "./run-cli";
import { withStallNotices } from "./stall-notice";
import { resumeOrReplay, type AgentSessions } from "./agent-sessions";
import { assertSafeModelId, buildCliPrompt, latestPrompt, type CliPrompt } from "./transcript";

export const DEFAULT_MODEL_ID = "default";

export interface CliLineEvent {
  delta?: string;
  usage?: TokenUsage;
  error?: string;
  contextWindow?: number;
  contextUsage?: TokenUsage;
  // The tool's own session id, for tools that can continue a session on the next turn.
  sessionId?: string;
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
  // With a session, the tool saves the turn so it can be continued, and continues `resume`.
  buildInvocation(
    model: string | undefined,
    prompt: CliPrompt,
    session?: { resume?: string },
  ): CliInvocation;
  parseLine(line: string): CliLineEvent | undefined;
  describeFailure(exit: CliExit): string;
}

export interface CliAdapterDeps {
  resolveBinary(): Promise<string | undefined>;
  childEnv(binaryPath: string): NodeJS.ProcessEnv;
  cwd: string;
  // Where a tool that can continue its own session keeps each pane's; tools without one get the
  // whole transcript every turn.
  sessions?: AgentSessions;
  // How long a tool may be silent before its latest warning is shown; shortened in tests.
  stallNoticeMs?: number;
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
  // One try of a reply. `session` is set when the pane's turns are kept, and names the session to
  // continue when there is one.
  async function* runTurn(
    req: SendMessageRequest,
    binary: string,
    prompt: CliPrompt,
    session: { resume?: string; keep(sessionId: string): void } | undefined,
  ): AsyncIterable<ChatChunk> {
    const model = req.model === DEFAULT_MODEL_ID ? undefined : assertSafeModelId(req.model);
    const invocation = spec.buildInvocation(
      model,
      prompt,
      session && (session.resume === undefined ? {} : { resume: session.resume }),
    );

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
    let sessionId: string | undefined;

    try {
      for await (const line of withStallNotices(run.lines, run.notice, deps.stallNoticeMs)) {
        if (typeof line !== "string") {
          yield { delta: "", done: false, notice: line.notice };
          continue;
        }
        const event = spec.parseLine(line);
        if (!event) continue;
        if (event.error !== undefined) streamError ??= event.error;
        if (event.contextWindow) contextWindow = event.contextWindow;
        if (event.contextUsage) contextUsage = event.contextUsage;
        if (event.sessionId) sessionId = event.sessionId;
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
      if (session && sessionId) session.keep(sessionId);
      yield {
        delta: "",
        done: true,
        ...(hasUsage ? { usage } : {}),
        ...(contextWindow ? { contextWindow } : {}),
        ...(contextUsage ? { contextUsage } : {}),
        ...(session?.resume ? { resumed: true } : {}),
      };
    } finally {
      run.kill();
    }
  }

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
      const full = buildCliPrompt(req.messages);
      const sessions = deps.sessions?.tracks(req) ? deps.sessions : undefined;
      if (!sessions) {
        yield* runTurn(req, binary, full, undefined);
        return;
      }
      // What the tool's session was started with; when it changes, the session no longer fits.
      const setup = JSON.stringify([req.model, full.system ?? ""]);
      const keep = (sessionId: string) => sessions.keep(req, setup, sessionId);
      const resume = sessions.take(req, setup);
      yield* resumeOrReplay(
        resume === undefined
          ? undefined
          : () => runTurn(req, binary, latestPrompt(req.messages), { resume, keep }),
        () => runTurn(req, binary, full, { keep }),
        req.signal,
      );
    },
  };
}
