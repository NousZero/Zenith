import type { CustomProvider, CustomProviderInput } from "../shared/custom-providers";
import { contextBridge, ipcRenderer } from "electron";

import type { BotPlatform, BotSettingsUpdate, BotStatus } from "../shared/bots";
import type { LibraryItem, LibraryKind } from "../shared/library";
import type {
  ChatChunk,
  BoardCard,
  BoardStatus,
  GateResult,
  Goal,
  GoalInput,
  GitStatus,
  GitWorktree,
  WorkspaceEntry,
  VoiceStatus,
  WorkspaceFile,
  ChatMessage,
  ConnectionStatus,
  ContextSnapshot,
  HistoryExcerpt,
  ImageAttachment,
  SandboxStatus,
  PermissionRequest,
  ReviewResult,
  ScheduledTask,
  SemanticStatus,
  PersonaFile,
  SearchResult,
  UsageInsights,
  Model,
  SessionState,
  SessionSummary,
  ZenithApi,
} from "../shared/types";

const zenithApi: ZenithApi = {
  connections: {
    list: (refresh?: boolean): Promise<ConnectionStatus[]> =>
      ipcRenderer.invoke("connections:list", refresh === true),
  },
  attachments: {
    save: (mediaType: string, data: string): Promise<ImageAttachment> =>
      ipcRenderer.invoke("attachments:save", { mediaType, data }),
    read: (id: string): Promise<string> => ipcRenderer.invoke("attachments:read", id),
  },
  files: {
    saveAs: (input: {
      suggestedName: string;
      content: string;
      kind: "markdown" | "html";
    }): Promise<string | null> => ipcRenderer.invoke("files:saveAs", input),
  },
  cli: {
    claudeCommand: (name: string): Promise<string> => ipcRenderer.invoke("cli:claudeCommand", name),
  },
  providers: {
    listModels: (providerId: string): Promise<Model[]> =>
      ipcRenderer.invoke("providers:listModels", providerId),
  },
  customProviders: {
    list: (): Promise<CustomProvider[]> => ipcRenderer.invoke("customProviders:list"),
    save: (input: CustomProviderInput): Promise<CustomProvider[]> =>
      ipcRenderer.invoke("customProviders:save", input),
    remove: (id: string): Promise<CustomProvider[]> =>
      ipcRenderer.invoke("customProviders:remove", id),
  },
  credentials: {
    list: (): Promise<string[]> => ipcRenderer.invoke("credentials:list"),
    set: (providerId: string, secret: string): Promise<void> =>
      ipcRenderer.invoke("credentials:set", { providerId, secret }),
    delete: (providerId: string): Promise<void> =>
      ipcRenderer.invoke("credentials:delete", providerId),
  },
  persona: {
    get: (file: PersonaFile): Promise<string> => ipcRenderer.invoke("persona:get", file),
    set: (file: PersonaFile, text: string): Promise<void> =>
      ipcRenderer.invoke("persona:set", { file, text }),
  },
  history: {
    search: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke("history:search", query),
    retrieve: (question: string): Promise<HistoryExcerpt[]> =>
      ipcRenderer.invoke("history:retrieve", question),
    insights: (sinceMs: number): Promise<UsageInsights> =>
      ipcRenderer.invoke("history:insights", sinceMs),
    semanticStatus: (): Promise<SemanticStatus> => ipcRenderer.invoke("history:semanticStatus"),
    setSemanticModel: (model: string): Promise<SemanticStatus> =>
      ipcRenderer.invoke("history:setSemanticModel", model),
  },
  projects: {
    choose: (): Promise<string | null> => ipcRenderer.invoke("projects:choose"),
    rollback: (turnId: string): Promise<string[]> => ipcRenderer.invoke("agent:rollback", turnId),
    listCards: (projectPath: string): Promise<BoardCard[]> =>
      ipcRenderer.invoke("board:list", projectPath),
    saveCard: (card: {
      id?: string;
      projectPath: string;
      title: string;
      status: BoardStatus;
    }): Promise<BoardCard[]> => ipcRenderer.invoke("board:save", card),
    deleteCard: (id: string, projectPath: string): Promise<BoardCard[]> =>
      ipcRenderer.invoke("board:delete", { id, projectPath }),
  },
  bots: {
    list: (): Promise<BotStatus[]> => ipcRenderer.invoke("bots:list"),
    configure: (platform: BotPlatform, update: BotSettingsUpdate): Promise<BotStatus[]> =>
      ipcRenderer.invoke("bots:configure", { platform, update }),
    pair: (platform: BotPlatform): Promise<BotStatus[]> =>
      ipcRenderer.invoke("bots:pair", platform),
    removeUser: (platform: BotPlatform, userId: string): Promise<BotStatus[]> =>
      ipcRenderer.invoke("bots:removeUser", { platform, userId }),
    onStatus(listener: (statuses: BotStatus[]) => void): () => void {
      const handler = (_event: unknown, statuses: BotStatus[]) => listener(statuses);
      ipcRenderer.on("bots:status", handler);
      return () => ipcRenderer.removeListener("bots:status", handler);
    },
  },
  library: {
    list: (projectPaths: string[]): Promise<LibraryItem[]> =>
      ipcRenderer.invoke("library:list", projectPaths),
    read: (path: string): Promise<{ item: LibraryItem; body: string }> =>
      ipcRenderer.invoke("library:read", path),
    save: (input: {
      kind: LibraryKind;
      name: string;
      description: string;
      body: string;
      tools?: string;
      previousPath?: string;
    }): Promise<string> => ipcRenderer.invoke("library:save", input),
    remove: (path: string): Promise<void> => ipcRenderer.invoke("library:remove", path),
  },
  workspace: {
    list: (projectPath: string, relativePath: string): Promise<WorkspaceEntry[]> =>
      ipcRenderer.invoke("workspace:list", { projectPath, relativePath }),
    read: (projectPath: string, relativePath: string): Promise<WorkspaceFile> =>
      ipcRenderer.invoke("workspace:read", { projectPath, relativePath }),
    files: (projectPath: string): Promise<string[]> =>
      ipcRenderer.invoke("workspace:files", projectPath),
    gitStatus: (projectPath: string): Promise<GitStatus> =>
      ipcRenderer.invoke("workspace:gitStatus", projectPath),
    gitDiff: (projectPath: string, path: string, state: string): Promise<string> =>
      ipcRenderer.invoke("workspace:gitDiff", { projectPath, path, state }),
    gitCommit: (projectPath: string, message: string): Promise<string> =>
      ipcRenderer.invoke("workspace:gitCommit", { projectPath, message }),
    worktrees: (projectPath: string): Promise<GitWorktree[]> =>
      ipcRenderer.invoke("workspace:worktrees", projectPath),
    addWorktree: (projectPath: string, branch: string): Promise<string> =>
      ipcRenderer.invoke("workspace:addWorktree", { projectPath, branch }),
    runCommand: (projectPath: string, command: string): Promise<string> =>
      ipcRenderer.invoke("workspace:run", { projectPath, command }),
    stopCommand: (id: string): Promise<void> => ipcRenderer.invoke("workspace:stop", id),
    onCommandOutput(
      listener: (event: { id: string; text?: string; exitCode?: number | null }) => void,
    ): () => void {
      const handler = (
        _event: unknown,
        payload: { id: string; text?: string; exitCode?: number | null },
      ) => listener(payload);
      ipcRenderer.on("workspace:output", handler);
      return () => ipcRenderer.removeListener("workspace:output", handler);
    },
  },
  screen: {
    capture: (): Promise<ImageAttachment> => ipcRenderer.invoke("screen:capture"),
  },
  goals: {
    list: (): Promise<Goal[]> => ipcRenderer.invoke("goals:list"),
    create: (input: GoalInput): Promise<Goal> => ipcRenderer.invoke("goals:create", input),
    update: (id: string, input: GoalInput): Promise<Goal> =>
      ipcRenderer.invoke("goals:update", { id, input }),
    remove: (id: string): Promise<void> => ipcRenderer.invoke("goals:remove", id),
  },
  voice: {
    status: (): Promise<VoiceStatus> => ipcRenderer.invoke("voice:status"),
    setModel: (path: string): Promise<VoiceStatus> => ipcRenderer.invoke("voice:set-model", path),
    transcribe: (audio: Uint8Array): Promise<string> =>
      ipcRenderer.invoke("voice:transcribe", audio),
  },
  terminal: {
    available: (): Promise<boolean> => ipcRenderer.invoke("terminal:available"),
    start: (projectPath: string, columns: number, rows: number): Promise<string> =>
      ipcRenderer.invoke("terminal:start", { projectPath, columns, rows }),
    write: (id: string, data: string): Promise<void> =>
      ipcRenderer.invoke("terminal:write", { id, data }),
    resize: (id: string, columns: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("terminal:resize", { id, columns, rows }),
    stop: (id: string): Promise<void> => ipcRenderer.invoke("terminal:stop", id),
    onData(listener: (event: { id: string; data: string }) => void): () => void {
      const handler = (_event: unknown, payload: { id: string; data: string }) => listener(payload);
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },
    onExit(listener: (event: { id: string; code: number }) => void): () => void {
      const handler = (_event: unknown, payload: { id: string; code: number }) => listener(payload);
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    },
  },
  schedule: {
    list: (): Promise<ScheduledTask[]> => ipcRenderer.invoke("schedule:list"),
    save: (input: {
      id?: string;
      name: string;
      prompt: string;
      schedule: string;
      providerId: string;
      modelId: string;
      deliverTo: string[];
      enabled: boolean;
    }): Promise<ScheduledTask[]> => ipcRenderer.invoke("schedule:save", input),
    remove: (id: string): Promise<ScheduledTask[]> => ipcRenderer.invoke("schedule:remove", id),
    runNow: (id: string): Promise<ScheduledTask> => ipcRenderer.invoke("schedule:runNow", id),
    onChanged(listener: (tasks: ScheduledTask[]) => void): () => void {
      const handler = (_event: unknown, tasks: ScheduledTask[]) => listener(tasks);
      ipcRenderer.on("schedule:changed", handler);
      return () => ipcRenderer.removeListener("schedule:changed", handler);
    },
  },
  sandbox: {
    status: (): Promise<SandboxStatus> => ipcRenderer.invoke("sandbox:status"),
    set: (enabled: boolean): Promise<SandboxStatus> => ipcRenderer.invoke("sandbox:set", enabled),
  },
  gates: {
    run: (projectPath: string): Promise<GateResult[]> =>
      ipcRenderer.invoke("gates:run", projectPath),
    review: (input: {
      projectPath: string;
      providerId: string;
      modelId: string;
    }): Promise<ReviewResult> => ipcRenderer.invoke("gates:review", input),
  },
  permissions: {
    get: (): Promise<string> => ipcRenderer.invoke("permissions:get"),
    set: (text: string): Promise<string | null> => ipcRenderer.invoke("permissions:set", text),
  },
  mcp: {
    get: (): Promise<string> => ipcRenderer.invoke("mcp:get"),
    set: (text: string): Promise<string | null> => ipcRenderer.invoke("mcp:set", text),
  },
  sessions: {
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke("sessions:list"),
    load: (id: string): Promise<SessionState | undefined> =>
      ipcRenderer.invoke("sessions:load", id),
    save: (session: SessionState): Promise<void> => ipcRenderer.invoke("sessions:save", session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("sessions:delete", id),
  },
  chat: {
    send: (request: {
      requestId: string;
      sessionId?: string;
      paneId: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
      projectPath?: string | null;
      planMode?: boolean;
      allowedTools?: string[];
    }): Promise<void> => ipcRenderer.invoke("chat:send", request),
    abort: (requestId: string): Promise<void> => ipcRenderer.invoke("chat:abort", requestId),
    complete: (request: {
      sessionId?: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
    }): Promise<string> => ipcRenderer.invoke("chat:complete", request),
    // What the pane's last request carried to the model, or null before the first one.
    context: (paneId: string): Promise<ContextSnapshot | null> =>
      ipcRenderer.invoke("chat:context", paneId),
    respondPermission: (permissionId: string, optionId: string | null): Promise<void> =>
      ipcRenderer.invoke("chat:respondPermission", { permissionId, optionId }),
    onPermission(listener: (request: PermissionRequest) => void): () => void {
      const handler = (_event: unknown, request: PermissionRequest) => listener(request);
      ipcRenderer.on("chat:permission", handler);
      return () => ipcRenderer.removeListener("chat:permission", handler);
    },
    onChunk(
      listener: (payload: { requestId: string; paneId: string; chunk: ChatChunk }) => void,
    ): () => void {
      const handler = (
        _event: unknown,
        payload: { requestId: string; paneId: string; chunk: ChatChunk },
      ) => listener(payload);
      ipcRenderer.on("chat:chunk", handler);
      return () => ipcRenderer.removeListener("chat:chunk", handler);
    },
  },
};

contextBridge.exposeInMainWorld("zenith", zenithApi);
