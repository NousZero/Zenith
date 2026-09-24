import { createHash, randomUUID } from "node:crypto";

import type {
  AgentActivity,
  AgentTodo,
  ChatChunk,
  ChatMessage,
  Model,
  PermissionChoice,
  PermissionPrompt,
  ProviderAdapter,
  SendMessageRequest,
  TokenUsage,
} from "../../shared/types";
import { asRecord, DEFAULT_MODEL_ID } from "../cli/cli-adapter";
import { assertSafeModelId, buildCliPrompt, withSystemPreamble } from "../cli/transcript";
import { withStallNotices } from "../cli/stall-notice";
import { AcpConnection } from "./connection";

const PROTOCOL_VERSION = 1;

export interface AcpAgentSpec {
  id: string;
  label: string;
  args: string[];
  // Extra environment for the agent, e.g. OpenCode permission rules; a function is read at each
  // launch, for values that can change while Zenith runs (Gemini's key file).
  env?: NodeJS.ProcessEnv | (() => NodeJS.ProcessEnv);
  // The sign-in method to use right after initialize, given the agent's environment, when the
  // agent needs telling (Gemini with an API key).
  signIn?(env: NodeJS.ProcessEnv): string | undefined;
}

export interface AcpAdapterDeps {
  resolveBinary(): Promise<string | undefined>;
  childEnv(binaryPath: string): NodeJS.ProcessEnv;
  cwd: string;
  clientVersion: string;
  // The user's MCP servers in ACP's session/new shape.
  mcpServers(): Promise<unknown[]>;
}

interface NewSessionResult {
  sessionId: string;
  models?: { availableModels?: { modelId: string; name?: string }[] };
}

interface ConversationSession {
  sessionId: string;
  modelId: string;
  // Hash of every message the agent has seen in this session, including its last reply.
  fingerprint: string;
  cwd: string;
}

type TurnEvent =
  | { delta: string }
  | { activity: AgentActivity }
  | { todos: AgentTodo[] }
  | { permission: Params; respond(result: unknown): void };

const ACP_TOOL_STATUS: Record<string, AgentActivity["status"]> = {
  pending: "running",
  in_progress: "running",
  completed: "done",
  failed: "failed",
};

// Maps ACP tool_call / tool_call_update and plan updates to Zenith's live task view.
export function toTaskEvent(
  update: Params,
  known: Map<string, AgentActivity>,
): TurnEvent | undefined {
  const kind = update["sessionUpdate"];
  if (kind === "tool_call" || kind === "tool_call_update") {
    const id = typeof update["toolCallId"] === "string" ? update["toolCallId"] : "";
    if (!id) return undefined;
    const previous = known.get(id);
    const title = typeof update["title"] === "string" ? update["title"] : previous?.title;
    const status =
      typeof update["status"] === "string" ? ACP_TOOL_STATUS[update["status"]] : previous?.status;
    const activity: AgentActivity = {
      id,
      tool: typeof update["kind"] === "string" ? update["kind"] : (previous?.tool ?? "tool"),
      title: title ?? "Tool call",
      status: status ?? "running",
    };
    known.set(id, activity);
    return { activity };
  }
  if (kind === "plan" && Array.isArray(update["entries"])) {
    const todos = update["entries"].flatMap((entry): AgentTodo[] => {
      const record = asRecord(entry);
      const status = record?.["status"];
      return typeof record?.["content"] === "string" &&
        (status === "pending" || status === "in_progress" || status === "completed")
        ? [{ content: record["content"], status }]
        : [];
    });
    return { todos };
  }
  return undefined;
}
type Params = Record<string, unknown>;

export function fingerprintMessages(messages: readonly ChatMessage[]): string {
  const canonical = messages.map(({ role, content }) => [role, content]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const PERMISSION_KINDS = new Set<PermissionChoice["kind"]>([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
]);

export function toPermissionPrompt(params: Params): PermissionPrompt {
  const toolCall = asRecord(params["toolCall"]);
  const title =
    typeof toolCall?.["title"] === "string" ? toolCall["title"] : "The agent wants to use a tool";
  const options = (Array.isArray(params["options"]) ? params["options"] : [])
    .map(asRecord)
    .flatMap((option): PermissionChoice[] => {
      const id = option?.["optionId"];
      const kind = option?.["kind"];
      if (typeof id !== "string" || !PERMISSION_KINDS.has(kind as PermissionChoice["kind"]))
        return [];
      const label = typeof option?.["name"] === "string" ? option["name"] : id;
      return [{ id, label, kind: kind as PermissionChoice["kind"] }];
    });
  return { title, options };
}

// Runs an ACP agent as one long-lived process and keeps one agent session per pane.
// A session is reused while the pane's history matches what the agent already saw;
// after retry, undo, branch, or a memory change Zenith starts a new session with the transcript.
// Errors from session/new that mean the agent wants a sign-in, not that something else broke.
const SIGN_IN_PROBLEM = /api.?key|auth|sign.?in|log.?in|credential|unauthori[sz]ed/i;
// The sign-in methods each connection's agent offered at initialize, API-key ones left out.
const signInMethods = new WeakMap<object, string[]>();

export function createAcpAdapter(
  spec: AcpAgentSpec,
  deps: AcpAdapterDeps,
): ProviderAdapter & {
  dispose(): void;
} {
  let connection: Promise<AcpConnection> | undefined;
  let knownModels: Model[] = [];
  const conversations = new Map<string, ConversationSession>();
  const turns = new Map<string, (event: TurnEvent) => void>();
  // Models are only reported by session/new, so listing them opens a session kept for the next turn.
  let spareSession: Promise<string> | undefined;
  // Latest context window size per agent session, from usage_update.
  const contextWindows = new Map<string, number>();
  const taskActivities = new Map<string, AgentActivity>();

  async function connect(): Promise<AcpConnection> {
    const binary = await deps.resolveBinary();
    if (!binary) throw new Error(`${spec.label} is not installed.`);
    const env = {
      ...deps.childEnv(binary),
      ...(typeof spec.env === "function" ? spec.env() : spec.env),
    };
    const conn = new AcpConnection({
      command: binary,
      args: spec.args,
      cwd: deps.cwd,
      env,
    });
    conn.onNotification("session/update", (params) => {
      const update = asRecord(params["update"]);
      const content = asRecord(update?.["content"]);
      if (
        typeof params["sessionId"] === "string" &&
        update?.["sessionUpdate"] === "usage_update" &&
        typeof update["size"] === "number" &&
        update["size"] > 0
      ) {
        contextWindows.set(params["sessionId"], update["size"]);
      }
      if (
        typeof params["sessionId"] === "string" &&
        update?.["sessionUpdate"] === "agent_message_chunk" &&
        content?.["type"] === "text" &&
        typeof content["text"] === "string"
      ) {
        turns.get(params["sessionId"])?.({ delta: content["text"] });
      } else if (typeof params["sessionId"] === "string" && update) {
        const turn = turns.get(params["sessionId"]);
        const event = turn && toTaskEvent(update, taskActivities);
        if (turn && event) turn(event);
      }
    });
    conn.onRequest(
      "session/request_permission",
      (params) =>
        new Promise((respond) => {
          const turn =
            typeof params["sessionId"] === "string" ? turns.get(params["sessionId"]) : undefined;
          if (turn) turn({ permission: params, respond });
          else respond({ outcome: { outcome: "cancelled" } });
        }),
    );
    try {
      const init = await conn.request<{ authMethods?: { id?: unknown }[] }>("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        // Zenith lends no file system or terminal; the agent works with its own tools.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "zenith", version: deps.clientVersion },
      });
      const offered = (init.authMethods ?? [])
        .map((method) => method.id)
        .filter((id): id is string => typeof id === "string");
      signInMethods.set(
        conn,
        offered.filter((id) => !/api.?key/i.test(id)),
      );
      const preferred = spec.signIn?.(env);
      if (preferred && offered.includes(preferred)) {
        await conn.request("authenticate", { methodId: preferred });
      }
    } catch (error) {
      conn.close();
      throw error;
    }
    return conn;
  }

  async function getConnection(): Promise<AcpConnection> {
    const existing = connection && (await connection.catch(() => undefined));
    if (existing && !existing.closed) return existing;
    conversations.clear();
    spareSession = undefined;
    connection = connect();
    connection.catch(() => {
      connection = undefined;
    });
    return connection;
  }

  async function newSession(conn: AcpConnection, cwd = deps.cwd): Promise<string> {
    const open = async () =>
      conn.request<NewSessionResult>("session/new", { cwd, mcpServers: await deps.mcpServers() });
    let result: NewSessionResult;
    try {
      result = await open();
    } catch (error) {
      result = await afterSignIn(conn, error, open);
    }
    const available = result.models?.availableModels ?? [];
    if (available.length > 0) {
      knownModels = available.map((model) => ({
        id: model.modelId,
        label: model.name ?? model.modelId,
      }));
    }
    return result.sessionId;
  }

  // Some agents (Gemini over ACP) only use the user's sign-in once the client asks for it, and
  // otherwise refuse a session with a misleading "API key is missing". On a sign-in-looking
  // refusal, each sign-in method the agent offered is tried; if none works, the error carries
  // the agent's own explanation, which is the one that says what to do.
  async function afterSignIn(
    conn: AcpConnection,
    error: unknown,
    open: () => Promise<NewSessionResult>,
  ): Promise<NewSessionResult> {
    const message = error instanceof Error ? error.message : String(error);
    const methods = signInMethods.get(conn) ?? [];
    if (!SIGN_IN_PROBLEM.test(message) || methods.length === 0) throw error;
    const reasons: string[] = [];
    for (const methodId of methods) {
      try {
        await conn.request("authenticate", { methodId });
        return await open();
      } catch (attempt) {
        reasons.push(attempt instanceof Error ? attempt.message : String(attempt));
      }
    }
    throw new Error(`${message} ${reasons.join(" ")}`.trim(), { cause: error });
  }

  // The spare session was opened in the sandbox, so only sandbox conversations can use it.
  function takeSession(conn: AcpConnection, cwd: string): Promise<string> {
    if (cwd !== deps.cwd) return newSession(conn, cwd);
    const spare = spareSession;
    spareSession = undefined;
    return spare ?? newSession(conn, cwd);
  }

  return {
    id: spec.id,

    async listModels() {
      if (knownModels.length === 0 && !spareSession) {
        const opening = getConnection().then((conn) => newSession(conn));
        spareSession = opening;
        opening.catch(() => {
          if (spareSession === opening) spareSession = undefined;
        });
      }
      await spareSession?.catch(() => undefined);
      return [{ id: DEFAULT_MODEL_ID, label: "Default" }, ...knownModels];
    },

    async validateCredential() {
      return true;
    },

    dispose() {
      void connection?.then((conn) => conn.close()).catch(() => undefined);
      connection = undefined;
    },

    async *sendMessage(request: SendMessageRequest): AsyncIterable<ChatChunk> {
      const conn = await getConnection();
      const key = request.conversationId ?? randomUUID();
      const history = request.messages.slice(0, -1);
      const latest = request.messages.at(-1);
      if (latest?.role !== "user")
        throw new Error("The conversation must end with a user message.");

      const cwd = request.projectPath ?? deps.cwd;
      const existing = conversations.get(key);
      const reuse =
        existing?.cwd === cwd &&
        existing.modelId === request.model &&
        existing.fingerprint === fingerprintMessages(history);
      conversations.delete(key);

      let sessionId: string;
      let promptText: string;
      if (reuse) {
        sessionId = existing.sessionId;
        promptText = latest.content;
      } else {
        sessionId = await takeSession(conn, cwd);
        if (request.model !== DEFAULT_MODEL_ID) {
          await conn.request("session/set_model", {
            sessionId,
            modelId: assertSafeModelId(request.model),
          });
        }
        promptText = withSystemPreamble(buildCliPrompt(request.messages));
      }

      const queue: TurnEvent[] = [];
      let wake: (() => void) | undefined;
      turns.set(sessionId, (event) => {
        queue.push(event);
        wake?.();
      });

      let finished = false;
      let failure: Error | undefined;
      let usage: TokenUsage | undefined;
      const onAbort = () => conn.notify("session/cancel", { sessionId });
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const prompt = conn
        .request<{ stopReason?: string; usage?: Params }>("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: promptText }],
        })
        .then((result) => {
          const input = result.usage?.["inputTokens"];
          const output = result.usage?.["outputTokens"];
          if (typeof input === "number" && typeof output === "number") {
            usage = { inputTokens: input, outputTokens: output };
          }
        })
        .catch((error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
        })
        .finally(() => {
          finished = true;
          wake?.();
        });

      // The turn's events in order, ending once the prompt request settles.
      async function* events(): AsyncGenerator<TurnEvent> {
        for (;;) {
          const event = queue.shift();
          if (event) {
            yield event;
            continue;
          }
          if (finished) return;
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
      }

      let reply = "";
      try {
        for await (const event of withStallNotices(events(), () => conn.notice)) {
          if ("notice" in event) {
            yield { delta: "", done: false, notice: event.notice };
          } else if ("delta" in event) {
            reply += event.delta;
            yield { delta: event.delta, done: false };
          } else if ("activity" in event) {
            yield { delta: "", done: false, activity: event.activity };
          } else if ("todos" in event) {
            yield { delta: "", done: false, todos: event.todos };
          } else {
            const choice =
              request.signal?.aborted || !request.requestPermission
                ? undefined
                : await request.requestPermission(toPermissionPrompt(event.permission));
            event.respond(
              choice === undefined
                ? { outcome: { outcome: "cancelled" } }
                : { outcome: { outcome: "selected", optionId: choice } },
            );
          }
        }
        await prompt;
      } finally {
        turns.delete(sessionId);
        request.signal?.removeEventListener("abort", onAbort);
      }
      if (failure) throw failure;
      if (request.signal?.aborted) return;
      conversations.set(key, {
        sessionId,
        cwd,
        modelId: request.model,
        fingerprint: fingerprintMessages([
          ...request.messages,
          { role: "assistant", content: reply },
        ]),
      });
      const contextWindow = contextWindows.get(sessionId);
      yield {
        delta: "",
        done: true,
        ...(usage ? { usage } : {}),
        ...(contextWindow ? { contextWindow } : {}),
      };
    },
  };
}
