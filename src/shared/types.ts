import type { CustomProvider, CustomProviderInput } from "./custom-providers";
import type { BotPlatform, BotSettingsUpdate, BotStatus } from "./bots";
import type { LibraryItem, LibraryKind } from "./library";

export type ChatRole = "user" | "assistant" | "system";

// One check run over what a reply changed. "skipped" means the check could not say either way.
export type AuditKind = "approval" | "command" | "edit" | "rollback" | "gate";

// One line of the audit log: something an agent did, or a decision the user made about it.
export interface AuditEntry {
  id: number;
  at: number;
  kind: AuditKind;
  projectPath: string | null;
  summary: string;
  outcome: string;
}

export interface GateResult {
  id: "secrets" | "problems" | "scope";
  label: string;
  state: "pass" | "fail" | "skipped";
  detail: string;
  // Lines to show, and to hand back to the agent when the check failed.
  findings: string[];
}

// A second opinion on the current changes, from a connection that did not write them.
export interface ReviewResult {
  // "unclear" means the reviewer answered in some other shape; read the text.
  verdict: "clean" | "findings" | "unclear";
  reviewer: string;
  text: string;
}

// Whether agent commands run in the operating system's sandbox; `available` names it, or is null
// where this system has none.
export interface SandboxStatus {
  available: string | null;
  enabled: boolean;
}

// An image pasted into a message. Stored by reference; `data` (base64) is filled in only by the
// main process when a request is sent.
export interface ImageAttachment {
  id: string;
  mediaType: string;
  data?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: ImageAttachment[];
}

// A message stored in a pane's conversation; the id is stable across saves.
export interface PaneMessage extends ChatMessage {
  id: string;
}

// What one request carried to the model, for the context inspector.
export interface ContextSnapshot {
  at: number;
  providerId: string;
  modelId: string;
  sections: { label: string; text: string; tokens: number }[];
  totalTokens: number;
  // Parts the connection adds itself, which Zenith can't see.
  note?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type AgentActivityStatus = "running" | "awaiting-approval" | "done" | "failed" | "denied";

// One tool call an agent made during a reply, for the live task view.
export interface AgentActivity {
  id: string;
  tool: string;
  title: string;
  status: AgentActivityStatus;
  // Short result or error text.
  detail?: string;
  // Set when Zenith saved a file before this call changed it.
  checkpoint?: boolean;
  // Renderer-side timing, in epoch milliseconds, for the duration shown on each line.
  startedAt?: number;
  endedAt?: number;
}

export interface AgentTodo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  usage?: TokenUsage;
  // Tokens of the final model call only. Agents make several calls per reply, so this, not
  // usage, shows how much of the context window the conversation fills.
  contextUsage?: TokenUsage;
  activity?: AgentActivity;
  todos?: AgentTodo[];
  // The agent saved something to the user's profile (USER.md).
  memoryChanged?: boolean;
  // Sent first when Zenith snapshotted the project, so undo can cover everything the reply changed.
  snapshot?: boolean;
  // The model's context window in tokens, when the tool reports it.
  contextWindow?: number;
}

export type ConnectionKind = "cli" | "agent" | "local" | "api-key";

export type ConnectionState =
  "ready" | "not-installed" | "sign-in-required" | "not-running" | "needs-key";

export interface ConnectionStatus {
  id: string;
  label: string;
  kind: ConnectionKind;
  state: ConnectionState;
  detail: string;
}

export interface Model {
  id: string;
  label: string;
}

export interface PermissionChoice {
  id: string;
  label: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

// An agent asking before it runs a tool, e.g. a shell command or a file edit.
export interface PermissionPrompt {
  title: string;
  options: PermissionChoice[];
  // The tool and what it would act on, so denying twice can offer a rule. Agents that keep their
  // own permissions (ACP) don't set these.
  tool?: string;
  subject?: string;
  // Command text or tool input shown under the title.
  detail?: string;
  // Unified diff of a proposed file change.
  diff?: string;
  warning?: string;
}

export interface PermissionRequest extends PermissionPrompt {
  permissionId: string;
  requestId: string;
  paneId: string;
}

export interface SendMessageRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  // Stable per pane, so stateful agents can keep one session per conversation.
  conversationId?: string;
  // Folder an agent may work in; without it agents use Zenith's empty sandbox.
  projectPath?: string;
  // Identifies the reply, so file checkpoints can be rolled back later.
  turnId?: string;
  // Read-only planning: agents get no tools that change files or run commands.
  planMode?: boolean;
  // Tool names an agent definition allows; undefined means the default set.
  allowedTools?: string[];
  // Resolves to the chosen option id, or undefined to cancel.
  requestPermission?(prompt: PermissionPrompt): Promise<string | undefined>;
}

export interface ProviderAdapter {
  id: string;
  listModels(): Promise<Model[]>;
  sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk>;
  validateCredential(cred: string): Promise<boolean>;
}

export interface PaneState {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  included: boolean;
  memoryEnabled: boolean;
  messages: PaneMessage[];
  promptTokens: number;
  completionTokens: number;
  lastError: string | null;
  // Last context window a tool reported for this pane's model; null until one is reported.
  contextWindow: number | null;
  // Project folder for agent connections; null means chat only.
  projectPath: string | null;
  // Library agent file whose instructions this pane follows; null for none.
  agentPath: string | null;
  // Plan mode: the agent reads and plans but changes nothing.
  planMode: boolean;
}

export type GoalStatus = "active" | "paused" | "done";

// Something the user is working towards, kept between sessions.
export interface Goal {
  id: string;
  title: string;
  detail: string;
  status: GoalStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalInput {
  title: string;
  detail?: string;
  status?: GoalStatus;
  progress?: number;
}

// Whether speech can be transcribed here, and what is missing when it cannot.
export interface VoiceStatus {
  available: boolean;
  binaryPath?: string;
  modelPath?: string;
  problem?: string;
}

export interface GitStatus {
  isRepository: boolean;
  branch: string;
  files: {
    path: string;
    state: "modified" | "added" | "deleted" | "renamed" | "untracked";
    staged: boolean;
  }[];
}

export interface GitWorktree {
  path: string;
  branch: string;
}

export interface WorkspaceEntry {
  name: string;
  // Relative to the project folder, with "/" separators.
  path: string;
  kind: "file" | "directory";
}

export interface WorkspaceFile {
  path: string;
  // Null when the file can't be shown; reason says why.
  content: string | null;
  reason: string | null;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  // Five-field cron expression in local time, or @hourly / @daily / @weekly.
  schedule: string;
  providerId: string;
  modelId: string;
  // Paired bot users as "platform:userId"; results always appear in Zenith too.
  deliverTo: string[];
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastResult: string | null;
  lastError: string | null;
}

export type BoardStatus = "todo" | "doing" | "done";

export interface BoardCard {
  id: string;
  projectPath: string;
  title: string;
  status: BoardStatus;
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
  // From the session's first pane, so the session list can say what it runs where.
  providerId?: string | undefined;
  projectPath?: string | undefined;
}

export interface SessionState {
  id: string;
  name: string;
  memoryText: string;
  // Id from src/shared/personalities.ts; "" means none.
  personalityId: string;
  panes: PaneState[];
  updatedAt: number;
}

export interface SearchResult {
  messageId: string;
  role: ChatRole;
  sessionId: string;
  sessionName: string;
  paneName: string;
  providerId: string;
  // Matched words are wrapped in HIT_START / HIT_END from src/shared/history.ts.
  snippet: string;
  updatedAt: number;
}

export interface HistoryExcerpt {
  sessionName: string;
  paneName: string;
  role: ChatRole;
  content: string;
}

export interface SemanticStatus {
  // Ollama embedding model used for meaning-based search; "" when it is off.
  model: string;
  indexed: number;
  total: number;
}

export interface UsageRecord {
  sessionId: string | null;
  paneId: string | null;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

export interface UsageInsights {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  estimatedTurns: number;
  sessions: number;
  byConnection: {
    providerId: string;
    modelId: string;
    turns: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  // Local calendar days, oldest first, only days with activity.
  byDay: { day: string; turns: number; tokens: number }[];
}

export type PersonaFile = "SOUL.md" | "USER.md";

export interface ZenithApi {
  connections: {
    list(refresh?: boolean): Promise<ConnectionStatus[]>;
  };
  providers: {
    listModels(providerId: string): Promise<Model[]>;
  };
  attachments: {
    // Stores a pasted image (base64) and returns its reference; rejects unsupported or oversized images.
    save(mediaType: string, data: string): Promise<ImageAttachment>;
    // A data URL for displaying a stored image.
    read(id: string): Promise<string>;
  };
  files: {
    // Opens the system save dialog and writes the text there; null when the user cancels.
    saveAs(input: {
      suggestedName: string;
      content: string;
      kind: "markdown" | "html";
    }): Promise<string | null>;
  };
  cli: {
    // Runs one of Claude Code's read-only commands ("/usage", "/cost", "/model", "/doctor")
    // and returns what it printed.
    claudeCommand(name: string): Promise<string>;
  };
  customProviders: {
    list(): Promise<CustomProvider[]>;
    // Rejects with a readable message for invalid input.
    save(input: CustomProviderInput): Promise<CustomProvider[]>;
    remove(id: string): Promise<CustomProvider[]>;
  };
  credentials: {
    list(): Promise<string[]>;
    set(providerId: string, secret: string): Promise<void>;
    delete(providerId: string): Promise<void>;
  };
  persona: {
    get(file: PersonaFile): Promise<string>;
    set(file: PersonaFile, text: string): Promise<void>;
  };
  history: {
    search(query: string): Promise<SearchResult[]>;
    retrieve(question: string): Promise<HistoryExcerpt[]>;
    insights(sinceMs: number): Promise<UsageInsights>;
    semanticStatus(): Promise<SemanticStatus>;
    // Resolves to the new status, or rejects when the model can't embed text.
    setSemanticModel(model: string): Promise<SemanticStatus>;
  };
  projects: {
    // Opens the system folder picker; null when cancelled.
    choose(): Promise<string | null>;
    // Restores files an agent changed during one reply; returns the restored paths.
    rollback(turnId: string): Promise<string[]>;
    listCards(projectPath: string): Promise<BoardCard[]>;
    saveCard(card: {
      id?: string;
      projectPath: string;
      title: string;
      status: BoardStatus;
    }): Promise<BoardCard[]>;
    deleteCard(id: string, projectPath: string): Promise<BoardCard[]>;
  };
  bots: {
    list(): Promise<BotStatus[]>;
    configure(platform: BotPlatform, update: BotSettingsUpdate): Promise<BotStatus[]>;
    // Creates a one-time code the user sends to the bot as /pair CODE.
    pair(platform: BotPlatform): Promise<BotStatus[]>;
    removeUser(platform: BotPlatform, userId: string): Promise<BotStatus[]>;
    onStatus(listener: (statuses: BotStatus[]) => void): () => void;
  };
  library: {
    // Skills, commands, and agents from Zenith, the given project folders, and other tools.
    list(projectPaths: string[]): Promise<LibraryItem[]>;
    read(path: string): Promise<{ item: LibraryItem; body: string }>;
    save(input: {
      kind: LibraryKind;
      name: string;
      description: string;
      body: string;
      tools?: string;
      previousPath?: string;
    }): Promise<string>;
    remove(path: string): Promise<void>;
  };
  audit: {
    // Newest first.
    list(limit?: number): Promise<AuditEntry[]>;
  };
  workspace: {
    list(projectPath: string, relativePath: string): Promise<WorkspaceEntry[]>;
    read(projectPath: string, relativePath: string): Promise<WorkspaceFile>;
    // Relative paths of the project's files, for `@` mentions; empty outside Git.
    files(projectPath: string): Promise<string[]>;
    gitStatus(projectPath: string): Promise<GitStatus>;
    gitDiff(projectPath: string, path: string, state: string): Promise<string>;
    // Stages every change and commits it; returns the short commit hash.
    gitCommit(projectPath: string, message: string): Promise<string>;
    worktrees(projectPath: string): Promise<GitWorktree[]>;
    // Creates a worktree on a new branch next to the project; returns its folder.
    addWorktree(projectPath: string, branch: string): Promise<string>;
    runCommand(projectPath: string, command: string): Promise<string>;
    stopCommand(id: string): Promise<void>;
    onCommandOutput(
      listener: (event: { id: string; text?: string; exitCode?: number | null }) => void,
    ): () => void;
  };
  // A real terminal (pseudo-terminal) running the user's shell in a project folder.
  screen: {
    capture(): Promise<ImageAttachment>;
  };
  goals: {
    list(): Promise<Goal[]>;
    create(input: GoalInput): Promise<Goal>;
    update(id: string, input: GoalInput): Promise<Goal>;
    remove(id: string): Promise<void>;
  };
  voice: {
    status(): Promise<VoiceStatus>;
    setModel(path: string): Promise<VoiceStatus>;
    transcribe(audio: Uint8Array): Promise<string>;
  };
  terminal: {
    available(): Promise<boolean>;
    start(projectPath: string, columns: number, rows: number): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, columns: number, rows: number): Promise<void>;
    stop(id: string): Promise<void>;
    onData(listener: (event: { id: string; data: string }) => void): () => void;
    onExit(listener: (event: { id: string; code: number }) => void): () => void;
  };
  schedule: {
    list(): Promise<ScheduledTask[]>;
    save(input: {
      id?: string;
      name: string;
      prompt: string;
      schedule: string;
      providerId: string;
      modelId: string;
      deliverTo: string[];
      enabled: boolean;
    }): Promise<ScheduledTask[]>;
    remove(id: string): Promise<ScheduledTask[]>;
    runNow(id: string): Promise<ScheduledTask>;
    onChanged(listener: (tasks: ScheduledTask[]) => void): () => void;
  };
  sandbox: {
    status(): Promise<SandboxStatus>;
    set(enabled: boolean): Promise<SandboxStatus>;
  };
  gates: {
    // Checks over what changed in the project folder: secrets, language-server errors, scope.
    run(projectPath: string): Promise<GateResult[]>;
    // One request to another connection, asking it to review the current changes.
    review(input: {
      projectPath: string;
      providerId: string;
      modelId: string;
    }): Promise<ReviewResult>;
  };
  permissions: {
    // Agent permission rules as text, one "allow|ask|deny Tool pattern" per line.
    get(): Promise<string>;
    // Resolves to an error message when a line is not a valid rule.
    set(text: string): Promise<string | null>;
  };
  mcp: {
    get(): Promise<string>;
    // Resolves to an error message when the text is not a valid config.
    set(text: string): Promise<string | null>;
  };
  sessions: {
    list(): Promise<SessionSummary[]>;
    load(id: string): Promise<SessionState | undefined>;
    save(session: SessionState): Promise<void>;
    delete(id: string): Promise<void>;
  };
  chat: {
    send(request: {
      requestId: string;
      sessionId?: string;
      paneId: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
      projectPath?: string | null;
      planMode?: boolean;
      allowedTools?: string[];
    }): Promise<void>;
    abort(requestId: string): Promise<void>;
    // Runs one request to completion and returns the whole reply, e.g. for compaction.
    complete(request: {
      sessionId?: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
    }): Promise<string>;
    context(paneId: string): Promise<ContextSnapshot | null>;
    respondPermission(permissionId: string, optionId: string | null): Promise<void>;
    onPermission(listener: (request: PermissionRequest) => void): () => void;
    onChunk(
      listener: (payload: { requestId: string; paneId: string; chunk: ChatChunk }) => void,
    ): () => void;
  };
}
