import { randomUUID } from "node:crypto";
import {
  app,
  BrowserWindow,
  dialog,
  Notification,
  ipcMain,
  safeStorage,
  type IpcMainInvokeEvent,
} from "electron";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { homedir } from "node:os";

import { createAcpAdapter } from "./acp/acp-adapter";
import { runClaudeAgent } from "./agent/claude-agent";
import { formatFile } from "./agent/format";
import { createLanguageServers } from "./agent/lsp";
import { createMcpTools } from "./agent/mcp-client";
import { anthropicModel, openAiCompatibleModel, type ToolModel } from "./agent/models";
import { runNativeAgent } from "./agent/native-agent";
import { createBotManager } from "./bots/bot-manager";
import {
  createDiscordTransport,
  createSlackTransport,
  createHomeAssistantTransport,
  createSignalTransport,
  createTelegramTransport,
  createWhatsAppTransport,
} from "./bots/transports";
import { BOT_PLATFORMS, type BotPlatform, type BotSettingsUpdate } from "../shared/bots";
import { createLibraryStore } from "./library-store";
import { createGitRunner, createGitWorkspace, createSnapshotStore } from "./git";
import { createMcpConfig } from "./mcp-config";
import { createPtyTerminals } from "./pty-terminal";
import { describeContext } from "./context-snapshot";
import { createCustomProviderStore, customAdapter, customModel } from "./custom-providers";
import type { CustomProviderInput } from "../shared/custom-providers";
import { createScheduler } from "./scheduler";
import { createSemanticIndex, mergeExcerpts, ollamaEmbedder } from "./semantic-index";
import { createTerminal, insideProject, listDirectory, readWorkspaceFile } from "./workspace";
import { createProjectStore } from "./project-store";
import { createCliAdapter } from "./cli/cli-adapter";
import {
  childProcessPath,
  commandPath,
  resolveExecutable,
  type ExecutableEnvironment,
} from "./cli/resolve-executable";
import {
  AGENTS,
  apiKeyConnections,
  CLI_BINARIES,
  detectToolConnections,
  LOCAL_SERVERS,
  type ConnectionProbes,
} from "./connections";
import { createAnthropicAdapter } from "./providers/anthropic";
import { claudeCodeSpec } from "./providers/claude-code";
import { copilotCliSpec } from "./providers/copilot-cli";
import { geminiCliSpec } from "./providers/gemini-cli";
import { createLocalServerAdapter, fetchLocalModels } from "./providers/local-server";
import { createOpenAiAdapter } from "./providers/openai";
import { createOpenRouterAdapter } from "./providers/openrouter";
import { createProviderRegistry } from "./providers/registry";
import { createCredentialStore } from "./credential-store";
import { openDatabase } from "./database";
import { createHistoryStore } from "./history-store";
import { createSessionStore, importLegacyJsonSessions } from "./session-store";
import { estimateTokens } from "../shared/tokens";
import { parsePermissionRules } from "../shared/permissions";
import type {
  ChatChunk,
  BoardStatus,
  ChatMessage,
  ConnectionStatus,
  ContextSnapshot,
  PersonaFile,
  ProviderAdapter,
  SendMessageRequest,
  PermissionPrompt,
  PermissionRequest,
  SessionState,
} from "../shared/types";

const DETECTION_COMMAND_TIMEOUT_MS = 10_000;

// Connections that act on a project folder; Gemini CLI and Copilot CLI only chat. Providers the
// user adds ("custom:…") run Zenith's own agent and act on folders too.
const actsOnProject = (providerId: string) =>
  PROJECT_CONNECTIONS.has(providerId) || providerId.startsWith("custom:");
const PROJECT_CONNECTIONS = new Set([
  "claude-code",
  "hermes",
  "opencode",
  "ollama",
  "lmstudio",
  "openai",
  "anthropic",
  "openrouter",
]);

const sendToWindows = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send(channel, payload);
  }
};

export function registerIpcHandlers(options: {
  userDataPath: string;
  join: (...segments: string[]) => string;
}): { isOpenProject(projectPath: string): boolean; dispose(): void } {
  // Only the top-level Zenith page may call the main process. Frames are already blocked by the
  // content security policy; this refuses them here too.
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
        throw new Error("Refused a request from outside Zenith's main page.");
      }
      return listener(event, ...args);
    });
  };

  const credentials = createCredentialStore({
    safeStorage,
    filePath: options.join(options.userDataPath, "credentials.json"),
  });
  const dbPath = options.join(options.userDataPath, "zenith.db");
  const isNewDatabase = !existsSync(dbPath);
  const db = openDatabase(dbPath);
  const sessions = createSessionStore(db);
  const history = createHistoryStore(db);
  const semanticIndex = createSemanticIndex(db, ollamaEmbedder());
  const projects = createProjectStore(db);
  const git = createGitRunner(
    () => resolveBinary("git"),
    () => childProcessEnv(),
  );
  const gitWorkspace = createGitWorkspace(git);
  const snapshots = createSnapshotStore({
    db,
    git,
    directory: options.join(options.userDataPath, "snapshots"),
  });
  const terminal = createTerminal(
    {
      output: (id, text) => sendToWindows("workspace:output", { id, text }),
      exit: (id, exitCode) => sendToWindows("workspace:output", { id, exitCode }),
    },
    () => childProcessEnv(),
  );
  const terminals = createPtyTerminals(
    {
      data: (id, data) => sendToWindows("terminal:data", { id, data }),
      exit: (id, code) => sendToWindows("terminal:exit", { id, code }),
    },
    () => childProcessEnv(),
  );
  const mcp = createMcpConfig(options.join(options.userDataPath, "mcp.json"));
  const customProviders = createCustomProviderStore(
    options.join(options.userDataPath, "providers.json"),
    credentials,
  );
  const mcpTools = createMcpTools({
    servers: mcp.servers,
    env: () => childProcessEnv(),
    clientVersion: app.getVersion(),
  });
  const languageServers = createLanguageServers(() => childProcessEnv());
  const settingStatements = {
    get: db.prepare("SELECT value FROM app_settings WHERE key = ?"),
    set: db.prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ),
  };
  const permissionRulesText = () =>
    (settingStatements.get.get("permission_rules") as { value: string } | undefined)?.value ?? "";
  const permissionRules = () => {
    try {
      return parsePermissionRules(permissionRulesText());
    } catch {
      return [];
    }
  };
  // After an agent's edit: the project's formatter, then its language server's errors.
  const afterEdit = async (projectPath: string, filePath: string): Promise<string> => {
    const formatter = await formatFile(projectPath, filePath, childProcessEnv());
    const text = await readFile(filePath, "utf8").catch(() => undefined);
    const problems =
      text === undefined ? "" : await languageServers.problems(projectPath, filePath, text);
    return [
      formatter ? `Formatted with ${formatter}; read the file again before editing it.` : "",
      problems,
    ]
      .filter(Boolean)
      .join("\n\n");
  };
  const library = createLibraryStore({
    zenithDir: options.join(options.userDataPath, "library"),
    home: homedir(),
  });
  // Import is awaited by every sessions handler so the first list sees old sessions.
  const legacyImport = isNewDatabase
    ? importLegacyJsonSessions(sessions, options.join(options.userDataPath, "sessions")).catch(
        (error: unknown) => {
          console.error("Failed to import JSON sessions:", error);
        },
      )
    : Promise.resolve();

  // CLI tools run here: an empty Zenith-owned directory, never the user's projects.
  const cliSandbox = options.join(options.userDataPath, "cli-sandbox");
  mkdirSync(cliSandbox, { recursive: true });

  const environment: ExecutableEnvironment = {
    env: process.env,
    home: homedir(),
    platform: process.platform,
  };
  const binaryCache = new Map<string, Promise<string | undefined>>();
  const resolveBinary = (name: string): Promise<string | undefined> => {
    let cached = binaryCache.get(name);
    if (!cached) {
      cached = resolveExecutable(name, environment);
      binaryCache.set(name, cached);
    }
    return cached;
  };
  const childEnv = (binaryPath: string): NodeJS.ProcessEnv => ({
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("ELECTRON_")),
    ),
    PATH: childProcessPath(binaryPath, environment),
    NO_COLOR: "1",
    TERM: "dumb",
  });

  const childProcessEnv = (): NodeJS.ProcessEnv => ({
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("ELECTRON_")),
    ),
    PATH: commandPath(environment),
  });

  const probes: ConnectionProbes = {
    resolveBinary,
    runCommand: (binaryPath, args) =>
      new Promise((resolve) => {
        execFile(
          binaryPath,
          args,
          { cwd: cliSandbox, env: childEnv(binaryPath), timeout: DETECTION_COMMAND_TIMEOUT_MS },
          (error, stdout) => {
            const code = error && typeof error.code === "number" ? error.code : error ? null : 0;
            resolve({ stdout, exitCode: code });
          },
        );
      }),
    fetchLocalModels: (baseUrl) => fetchLocalModels(baseUrl),
    fileExists: (path) =>
      access(path).then(
        () => true,
        () => false,
      ),
    readJsonFile: async (path) => JSON.parse(await readFile(path, "utf8")) as unknown,
    env: process.env,
    home: environment.home,
    join: options.join,
  };

  let toolConnections: Promise<ConnectionStatus[]> | undefined;
  const listConnections = async (refresh: boolean): Promise<ConnectionStatus[]> => {
    if (refresh || !toolConnections) {
      binaryCache.clear();
      toolConnections = detectToolConnections(probes);
    }
    const [tools, saved] = await Promise.all([toolConnections, credentials.list()]);
    const custom = await customProviders.list();
    return [
      ...tools,
      // Built-in API providers appear only once a key was saved for them (before custom providers).
      ...apiKeyConnections(saved).filter((connection) => connection.state === "ready"),
      ...custom.map((provider): ConnectionStatus => ({
        id: provider.id,
        label: provider.name,
        kind: "api-key",
        state: provider.hasKey || provider.baseUrl.startsWith("http://") ? "ready" : "needs-key",
        detail: `${provider.api === "anthropic" ? "Anthropic API" : "OpenAI-compatible API"} · ${provider.baseUrl}`,
      })),
    ];
  };

  const requireCredential = (providerId: string) => async (): Promise<string> => {
    const secret = await credentials.get(providerId);
    if (!secret) throw new Error(`No credential configured for ${providerId}.`);
    return secret;
  };

  const cliDeps = (connectionId: keyof typeof CLI_BINARIES) => ({
    resolveBinary: () => resolveBinary(CLI_BINARIES[connectionId]),
    childEnv,
    cwd: cliSandbox,
  });

  // OpenCode's own rules may allow edits and shell commands silently; inside Zenith they ask.
  const openCodePermissions = JSON.stringify({
    edit: "ask",
    bash: "ask",
    webfetch: "ask",
    websearch: "ask",
    external_directory: "ask",
    task: "ask",
  });
  const bearer = (providerId: string) => async () => ({
    Authorization: `Bearer ${await requireCredential(providerId)()}`,
  });
  // With a project folder these connections run Zenith's own agent loop; without one they chat.
  const withNativeAgent = (adapter: ProviderAdapter, model: ToolModel): ProviderAdapter => ({
    ...adapter,
    sendMessage: (request: SendMessageRequest) =>
      request.projectPath
        ? runNativeAgent(
            { ...request, projectPath: request.projectPath },
            {
              model,
              childEnv: childProcessEnv(),
              saveCheckpoint: projects.saveCheckpoint,
              syncTodos: projects.syncTodos,
              profilePath: options.join(options.userDataPath, "USER.md"),
              permissionRules,
              afterEdit,
              extraTools: mcpTools.forProject,
            },
          )
        : adapter.sendMessage(request),
  });

  // With a project folder Claude Code runs as an agent; without one it stays a read-only chat.
  const claudeCodeChat = createCliAdapter(claudeCodeSpec, cliDeps("claude-code"));
  const claudeCode = {
    ...claudeCodeChat,
    sendMessage: (request: SendMessageRequest) =>
      request.projectPath
        ? runClaudeAgent(
            { ...request, projectPath: request.projectPath },
            {
              ...cliDeps("claude-code"),
              saveCheckpoint: projects.saveCheckpoint,
              syncTodos: projects.syncTodos,
              mcpConfigPath: mcp.claudeConfigPath,
              permissionRules,
            },
          )
        : claudeCodeChat.sendMessage(request),
  };

  const agentAdapters = AGENTS.map((agent) =>
    createAcpAdapter(
      {
        id: agent.id,
        label: agent.label,
        args: ["acp"],
        ...(agent.id === "opencode" ? { env: { OPENCODE_PERMISSION: openCodePermissions } } : {}),
      },
      { ...cliDeps(agent.id), clientVersion: app.getVersion(), mcpServers: mcp.acpServers },
    ),
  );

  // User-defined providers, rebuilt whenever the list changes.
  let customAdapters = new Map<string, ProviderAdapter>();
  const refreshCustomProviders = async () => {
    const stored = await customProviders.readStored();
    customAdapters = new Map(
      stored.map((provider) => [
        provider.id,
        withNativeAgent(customAdapter(provider, credentials), customModel(provider, credentials)),
      ]),
    );
  };
  void refreshCustomProviders();

  const registry = createProviderRegistry(
    [
      claudeCode,
      createCliAdapter(geminiCliSpec, cliDeps("gemini-cli")),
      createCliAdapter(copilotCliSpec, cliDeps("copilot-cli")),
      ...agentAdapters,
      ...LOCAL_SERVERS.map((server) =>
        withNativeAgent(
          createLocalServerAdapter(server),
          openAiCompatibleModel({
            label: server.label,
            baseUrl: `${server.baseUrl}/v1`,
            headers: async () => ({}),
          }),
        ),
      ),
      withNativeAgent(
        createOpenAiAdapter(requireCredential("openai")),
        openAiCompatibleModel({
          label: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          headers: bearer("openai"),
        }),
      ),
      withNativeAgent(
        createAnthropicAdapter(requireCredential("anthropic")),
        anthropicModel({ apiKey: requireCredential("anthropic") }),
      ),
      withNativeAgent(
        createOpenRouterAdapter(requireCredential("openrouter")),
        openAiCompatibleModel({
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          headers: bearer("openrouter"),
        }),
      ),
    ],
    (id) => customAdapters.get(id),
  );

  handle("customProviders:list", async () => customProviders.list());
  handle("customProviders:save", async (_event, input: CustomProviderInput) => {
    const list = await customProviders.save({
      ...(typeof input.id === "string" ? { id: input.id } : {}),
      name: String(input.name ?? ""),
      api: input.api,
      baseUrl: String(input.baseUrl ?? ""),
      models: Array.isArray(input.models) ? input.models.map(String) : [],
      apiKey: input.apiKey === null ? null : String(input.apiKey ?? ""),
    });
    await refreshCustomProviders();
    return list;
  });
  handle("customProviders:remove", async (_event, id: unknown) => {
    const list = await customProviders.remove(String(id));
    await refreshCustomProviders();
    return list;
  });

  const activeRequests = new Map<string, AbortController>();
  // The last request's context for each pane, shown by the context inspector.
  const contextSnapshots = new Map<string, ContextSnapshot>();
  handle(
    "chat:context",
    async (_event, paneId: unknown) => contextSnapshots.get(String(paneId)) ?? null,
  );
  const pendingPermissions = new Map<string, (optionId: string | undefined) => void>();

  handle(
    "chat:respondPermission",
    async (_event, payload: { permissionId: string; optionId: string | null }) => {
      const resolve = pendingPermissions.get(payload.permissionId);
      pendingPermissions.delete(payload.permissionId);
      resolve?.(typeof payload.optionId === "string" ? payload.optionId : undefined);
    },
  );

  // Claude Code's own read-only commands, run without a model call, so Zenith can show what the
  // CLI reports about the subscription and the installation.
  const CLAUDE_COMMANDS = ["/usage", "/cost", "/model", "/doctor"];
  handle("cli:claudeCommand", async (_event, name: unknown) => {
    const command = String(name);
    if (!CLAUDE_COMMANDS.includes(command)) throw new TypeError("Unknown Claude Code command.");
    const binary = await resolveBinary(CLI_BINARIES["claude-code"]);
    if (!binary) throw new Error("Claude Code isn't installed on this computer.");
    return new Promise<string>((resolve) => {
      const child = execFile(
        binary,
        ["-p", command, "--output-format", "text"],
        { cwd: cliSandbox, env: childEnv(binary), timeout: 120_000, maxBuffer: 4_000_000 },
        (error, stdout, stderr) => {
          const text = `${stdout}${stderr}`.trim();
          resolve(text || (error ? error.message : "(No output.)"));
        },
      );
      // Closes input at once, so the CLI doesn't wait for a pipe that will never send anything.
      child.stdin?.end();
    });
  });

  handle("connections:list", async (_event, refresh: unknown) => listConnections(refresh === true));

  handle("providers:listModels", async (_event, providerId: string) =>
    registry.get(providerId).listModels(),
  );

  handle("credentials:list", async () => credentials.list());
  handle("credentials:set", async (_event, payload: { providerId: string; secret: string }) =>
    credentials.set(payload.providerId, payload.secret),
  );
  handle("credentials:delete", async (_event, providerId: string) =>
    credentials.delete(providerId),
  );

  // SOUL.md and USER.md are plain files so they can also be edited outside Zenith.
  const PERSONA_FILES: readonly PersonaFile[] = ["SOUL.md", "USER.md"];
  const personaPath = (file: unknown): string => {
    if (!PERSONA_FILES.includes(file as PersonaFile)) throw new TypeError("Unknown persona file.");
    return options.join(options.userDataPath, file as PersonaFile);
  };
  handle("persona:get", async (_event, file: unknown) =>
    readFile(personaPath(file), "utf8").catch(() => ""),
  );
  // Writes text the window prepared to a file the user chooses in the system save dialog.
  handle(
    "files:saveAs",
    async (event, payload: { suggestedName: unknown; content: unknown; kind: unknown }) => {
      const kind = payload.kind === "html" ? "html" : "markdown";
      const window = BrowserWindow.fromWebContents(event.sender);
      const saveOptions = {
        title: "Export conversation",
        defaultPath: options.join(
          app.getPath("documents"),
          String(payload.suggestedName ?? "conversation").replace(/[\\/:*?"<>|]/g, "-"),
        ),
        filters:
          kind === "html"
            ? [{ name: "Web page", extensions: ["html"] }]
            : [{ name: "Markdown", extensions: ["md"] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, String(payload.content ?? ""), "utf8");
      return result.filePath;
    },
  );

  handle("persona:set", async (_event, payload: { file: unknown; text: unknown }) => {
    if (typeof payload.text !== "string") throw new TypeError("Persona text must be a string.");
    await writeFile(personaPath(payload.file), payload.text, "utf8");
  });

  // A project folder from the renderer must be an existing absolute directory.
  // Folders the window is working in. The preview scheme serves files from these and no others.
  const openProjects = new Set<string>();
  const validProjectPath = async (path: unknown): Promise<string | undefined> => {
    if (typeof path !== "string" || path === "") return undefined;
    if (!isAbsolute(path) || !(await stat(path).catch(() => undefined))?.isDirectory()) {
      throw new Error(`The project folder ${String(path)} is not available.`);
    }
    openProjects.add(path);
    return path;
  };

  handle("projects:choose", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Choose a project folder",
      buttonLabel: "Use folder",
      properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  // A Git snapshot covers everything the reply changed, including commands; file checkpoints
  // are the fallback when Git is missing or the snapshot failed.
  handle("agent:rollback", async (_event, turnId: unknown) => {
    if (typeof turnId !== "string") return [];
    if (snapshots.has(turnId)) {
      const restored = await snapshots.restore(turnId);
      await projects.rollback(turnId).catch(() => []);
      return restored;
    }
    return projects.rollback(turnId);
  });

  const projectArg = async (value: unknown): Promise<string> => {
    const path = await validProjectPath(value);
    if (!path) throw new Error("Choose a project folder first.");
    return path;
  };
  handle(
    "workspace:list",
    async (_event, payload: { projectPath: unknown; relativePath: unknown }) =>
      listDirectory(await projectArg(payload.projectPath), String(payload.relativePath ?? "")),
  );
  handle(
    "workspace:read",
    async (_event, payload: { projectPath: unknown; relativePath: unknown }) =>
      readWorkspaceFile(await projectArg(payload.projectPath), String(payload.relativePath ?? "")),
  );
  handle("workspace:gitStatus", async (_event, projectPath: unknown) =>
    gitWorkspace.status(await projectArg(projectPath)),
  );
  handle(
    "workspace:gitDiff",
    async (_event, payload: { projectPath: unknown; path: unknown; state: unknown }) => {
      const project = await projectArg(payload.projectPath);
      // Rejects paths that escape the folder before Git sees them.
      if (String(payload.state) !== "deleted") await insideProject(project, String(payload.path));
      return gitWorkspace.diff(project, String(payload.path), String(payload.state));
    },
  );
  handle(
    "workspace:gitCommit",
    async (_event, payload: { projectPath: unknown; message: unknown }) =>
      gitWorkspace.commit(await projectArg(payload.projectPath), String(payload.message ?? "")),
  );
  handle("workspace:worktrees", async (_event, projectPath: unknown) =>
    gitWorkspace.worktrees(await projectArg(projectPath)),
  );
  handle(
    "workspace:addWorktree",
    async (_event, payload: { projectPath: unknown; branch: unknown }) =>
      gitWorkspace.addWorktree(await projectArg(payload.projectPath), String(payload.branch ?? "")),
  );
  handle("workspace:run", async (_event, payload: { projectPath: unknown; command: unknown }) =>
    terminal.run(await projectArg(payload.projectPath), String(payload.command ?? "")),
  );
  handle("workspace:stop", async (_event, id: unknown) => terminal.stop(String(id)));

  // The workspace terminal: a real pseudo-terminal running the user's own shell.
  handle(
    "terminal:start",
    async (_event, payload: { projectPath: unknown; columns: unknown; rows: unknown }) =>
      terminals.start(
        await projectArg(payload.projectPath),
        Number(payload.columns) || 80,
        Number(payload.rows) || 24,
      ),
  );
  handle("terminal:write", async (_event, payload: { id: unknown; data: unknown }) =>
    terminals.write(String(payload.id), String(payload.data ?? "")),
  );
  handle(
    "terminal:resize",
    async (_event, payload: { id: unknown; columns: unknown; rows: unknown }) =>
      terminals.resize(
        String(payload.id),
        Number(payload.columns) || 80,
        Number(payload.rows) || 24,
      ),
  );
  handle("terminal:stop", async (_event, id: unknown) => terminals.stop(String(id)));
  handle("terminal:available", async () => terminals.available);
  handle("board:list", async (_event, projectPath: unknown) =>
    typeof projectPath === "string" ? projects.listCards(projectPath) : [],
  );
  handle(
    "board:save",
    async (
      _event,
      card: { id?: string; projectPath: string; title: string; status: BoardStatus },
    ) => {
      if (!["todo", "doing", "done"].includes(card.status) || card.title.trim() === "") {
        throw new TypeError("Invalid board card.");
      }
      return projects.saveCard({ ...card, title: card.title.trim() });
    },
  );
  handle("board:delete", async (_event, payload: { id: string; projectPath: string }) =>
    projects.deleteCard(payload.id, payload.projectPath),
  );
  handle("library:list", async (_event, projectPaths: unknown) =>
    library.list(
      Array.isArray(projectPaths)
        ? (
            await Promise.all(
              projectPaths.map((path) => validProjectPath(path).catch(() => undefined)),
            )
          ).filter((path): path is string => path !== undefined)
        : [],
    ),
  );
  handle("library:read", async (_event, path: unknown) => library.read(String(path)));
  handle("library:save", async (_event, input: Parameters<typeof library.save>[0]) =>
    library.save({
      kind: input.kind,
      name: String(input.name),
      description: String(input.description ?? ""),
      body: String(input.body ?? ""),
      ...(typeof input.tools === "string" ? { tools: input.tools } : {}),
      ...(typeof input.previousPath === "string" ? { previousPath: input.previousPath } : {}),
    }),
  );
  handle("library:remove", async (_event, path: unknown) => library.remove(String(path)));
  handle("permissions:get", async () => permissionRulesText());
  handle("permissions:set", async (_event, text: unknown) => {
    if (typeof text !== "string") throw new TypeError("Permission rules must be text.");
    try {
      parsePermissionRules(text);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    settingStatements.set.run("permission_rules", text);
    return null;
  });
  handle("mcp:get", async () => mcp.read());
  handle("mcp:set", async (_event, text: unknown) => {
    if (typeof text !== "string") throw new TypeError("mcp.json text must be a string.");
    try {
      await mcp.write(text);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  handle("history:search", async (_event, query: unknown) =>
    typeof query === "string" ? history.search(query) : [],
  );
  handle("history:retrieve", async (_event, question: unknown) => {
    if (typeof question !== "string") return [];
    // Meaning matches are optional; if Ollama is off, keyword matches still answer.
    const semantic = await semanticIndex.search(question, 8).catch((error: unknown) => {
      console.error("Meaning-based search failed:", error);
      return [];
    });
    return mergeExcerpts(semantic, history.retrieve(question), 10);
  });
  handle("history:semanticStatus", async () => semanticIndex.status());
  handle("history:setSemanticModel", async (_event, model: unknown) =>
    semanticIndex.setModel(String(model ?? "")),
  );
  handle("history:insights", async (_event, sinceMs: unknown) =>
    history.insights(typeof sinceMs === "number" ? sinceMs : 0),
  );

  // Records a finished reply; tools that report no usage get a chars/4 estimate.
  const recordUsage = (
    request: { sessionId?: string; paneId?: string; providerId: string; modelId: string },
    messages: ChatMessage[],
    reply: string,
    done: ChatChunk | undefined,
  ) => {
    try {
      history.recordUsage({
        sessionId: request.sessionId ?? null,
        paneId: request.paneId ?? null,
        providerId: request.providerId,
        modelId: request.modelId,
        inputTokens:
          done?.usage?.inputTokens ?? estimateTokens(messages.map((m) => m.content).join("\n")),
        outputTokens: done?.usage?.outputTokens ?? estimateTokens(reply),
        estimated: done?.usage === undefined,
      });
    } catch (error) {
      console.error("Failed to record usage:", error);
    }
  };

  handle("sessions:list", async () => {
    await legacyImport;
    return sessions.list();
  });
  handle("sessions:load", async (_event, id: string) => {
    await legacyImport;
    return sessions.load(id);
  });
  handle("sessions:save", async (_event, session: SessionState) => {
    await legacyImport;
    return sessions.save(session);
  });
  handle("sessions:delete", async (_event, id: string) => {
    await legacyImport;
    return sessions.delete(id);
  });

  handle(
    "chat:send",
    async (
      event: IpcMainInvokeEvent,
      payload: {
        requestId: string;
        sessionId?: string;
        paneId: string;
        providerId: string;
        modelId: string;
        messages: ChatMessage[];
        projectPath?: string | null;
        planMode?: boolean;
        allowedTools?: string[];
      },
    ) => {
      const controller = new AbortController();
      activeRequests.set(payload.requestId, controller);
      try {
        const projectPath = await validProjectPath(payload.projectPath);
        const adapter = registry.get(payload.providerId);
        // Recorded for the context inspector; a failure here never blocks the reply.
        void describeContext({
          providerId: payload.providerId,
          modelId: payload.modelId,
          messages: payload.messages,
          projectPath,
          planMode: payload.planMode === true,
          allowedTools: Array.isArray(payload.allowedTools) ? payload.allowedTools : undefined,
        })
          .then((snapshot) => contextSnapshots.set(payload.paneId, snapshot))
          .catch(() => undefined);
        const requestPermission = (prompt: PermissionPrompt) =>
          new Promise<string | undefined>((resolve) => {
            if (controller.signal.aborted || event.sender.isDestroyed()) return resolve(undefined);
            const permissionId = randomUUID();
            const settle = (optionId: string | undefined) => {
              pendingPermissions.delete(permissionId);
              controller.signal.removeEventListener("abort", cancel);
              // Only an option the agent offered may be chosen.
              resolve(
                prompt.options.some((option) => option.id === optionId) ? optionId : undefined,
              );
            };
            const cancel = () => settle(undefined);
            pendingPermissions.set(permissionId, settle);
            controller.signal.addEventListener("abort", cancel, { once: true });
            const request: PermissionRequest = {
              ...prompt,
              permissionId,
              requestId: payload.requestId,
              paneId: payload.paneId,
            };
            event.sender.send("chat:permission", request);
          });
        // Snapshot before any agent that can change files starts; plan mode changes nothing.
        if (projectPath && payload.planMode !== true && actsOnProject(payload.providerId)) {
          if (await snapshots.take(payload.requestId, projectPath)) {
            event.sender.send("chat:chunk", {
              requestId: payload.requestId,
              paneId: payload.paneId,
              chunk: { delta: "", done: false, snapshot: true },
            });
          }
        }
        let reply = "";
        for await (const chunk of adapter.sendMessage({
          model: payload.modelId,
          messages: payload.messages,
          signal: controller.signal,
          conversationId: payload.paneId,
          turnId: payload.requestId,
          ...(payload.planMode === true ? { planMode: true } : {}),
          ...(Array.isArray(payload.allowedTools)
            ? { allowedTools: payload.allowedTools.filter((tool) => typeof tool === "string") }
            : {}),
          ...(projectPath ? { projectPath } : {}),
          requestPermission,
        })) {
          reply += chunk.delta;
          if (chunk.done) recordUsage(payload, payload.messages, reply, chunk);
          if (event.sender.isDestroyed()) return;
          event.sender.send("chat:chunk", {
            requestId: payload.requestId,
            paneId: payload.paneId,
            chunk,
          });
        }
      } finally {
        activeRequests.delete(payload.requestId);
        // Settles any approval still waiting when the turn ends.
        controller.abort();
      }
    },
  );

  handle(
    "chat:complete",
    async (
      _event,
      payload: { sessionId?: string; providerId: string; modelId: string; messages: ChatMessage[] },
    ) => {
      let text = "";
      for await (const chunk of registry.get(payload.providerId).sendMessage({
        model: payload.modelId,
        messages: payload.messages,
      })) {
        text += chunk.delta;
        if (chunk.done) recordUsage(payload, payload.messages, text, chunk);
      }
      return text;
    },
  );

  // Bots answer paired users through chat connections only; agents that run tools are refused,
  // so a remote message can never start a tool.
  const botPlatform = (value: unknown): BotPlatform => {
    if (!BOT_PLATFORMS.some((platform) => platform.id === value)) {
      throw new TypeError("Unknown bot platform.");
    }
    return value as BotPlatform;
  };
  const bots = createBotManager({
    db,
    transports: {
      telegram: (secrets) => createTelegramTransport(secrets),
      discord: createDiscordTransport,
      slack: createSlackTransport,
      whatsapp: (secrets) => createWhatsAppTransport(secrets),
      signal: createSignalTransport,
      homeassistant: createHomeAssistantTransport,
    },
    readSecrets: async (platform) => {
      const saved = await credentials.get(`bot:${platform}`);
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    },
    writeSecrets: (platform, secrets) =>
      credentials.set(`bot:${platform}`, JSON.stringify(secrets)),
    checkConnection: (providerId) => {
      if (AGENTS.some((agent) => agent.id === providerId)) {
        return "This bot is set to an agent that can run tools, which bots may not use. Choose a chat connection in Zenith → Bots.";
      }
      try {
        registry.get(providerId);
        return undefined;
      } catch {
        return "The connection chosen for this bot is not available in Zenith.";
      }
    },
    reply: async ({ platform, providerId, modelId, messages }) => {
      let text = "";
      for await (const chunk of registry
        .get(providerId)
        .sendMessage({ model: modelId, messages })) {
        text += chunk.delta;
        if (chunk.done) {
          recordUsage({ paneId: `bot:${platform}`, providerId, modelId }, messages, text, chunk);
        }
      }
      return text;
    },
    onStatus: (statuses) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.webContents.isDestroyed()) window.webContents.send("bots:status", statuses);
      }
    },
  });
  void bots.startAll().catch((error: unknown) => console.error("Failed to start bots:", error));

  // Scheduled prompts run unattended as plain chats: agents with tools are refused, and no
  // project folder is passed, so nothing can change files without someone approving it.
  const scheduler = createScheduler({
    db,
    run: async (task) => {
      if (AGENTS.some((agent) => agent.id === task.providerId)) {
        throw new Error(
          "Scheduled tasks can't use agents that run tools. Choose a chat connection.",
        );
      }
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `This is the scheduled task "${task.name}", running without the user present. Reply with the result only.`,
        },
        { role: "user", content: task.prompt },
      ];
      let text = "";
      for await (const chunk of registry
        .get(task.providerId)
        .sendMessage({ model: task.modelId, messages })) {
        text += chunk.delta;
        if (chunk.done) {
          recordUsage(
            { paneId: `schedule:${task.id}`, providerId: task.providerId, modelId: task.modelId },
            messages,
            text,
            chunk,
          );
        }
      }
      return text;
    },
    deliver: async (target, text) => {
      const separator = target.indexOf(":");
      await bots.notify(botPlatform(target.slice(0, separator)), target.slice(separator + 1), text);
    },
    announce: (task) => {
      if (Notification.isSupported()) {
        new Notification({
          title: task.lastError && !task.lastResult ? `${task.name} failed` : task.name,
          body: (task.lastResult ?? task.lastError ?? "").slice(0, 240),
        }).show();
      }
      sendToWindows("schedule:changed", scheduler.list());
    },
  });
  scheduler.start();

  handle("schedule:list", async () => scheduler.list());
  handle("schedule:save", async (_event, input: Parameters<typeof scheduler.save>[0]) =>
    scheduler.save({
      ...(typeof input.id === "string" ? { id: input.id } : {}),
      name: String(input.name ?? ""),
      prompt: String(input.prompt ?? ""),
      schedule: String(input.schedule ?? ""),
      providerId: String(input.providerId ?? ""),
      modelId: String(input.modelId ?? ""),
      deliverTo: Array.isArray(input.deliverTo) ? input.deliverTo.map(String) : [],
      enabled: input.enabled === true,
    }),
  );
  handle("schedule:remove", async (_event, id: unknown) => scheduler.remove(String(id)));
  handle("schedule:runNow", async (_event, id: unknown) => scheduler.runNow(String(id)));

  handle("bots:list", async () => bots.list());
  handle(
    "bots:configure",
    async (_event, payload: { platform: unknown; update: BotSettingsUpdate }) =>
      bots.configure(botPlatform(payload.platform), payload.update),
  );
  handle("bots:pair", async (_event, platform: unknown) =>
    bots.startPairing(botPlatform(platform)),
  );
  handle("bots:removeUser", async (_event, payload: { platform: unknown; userId: string }) =>
    bots.removeUser(botPlatform(payload.platform), String(payload.userId)),
  );

  handle("chat:abort", async (_event, requestId: string) => {
    activeRequests.get(requestId)?.abort();
  });

  return {
    isOpenProject: (projectPath: string): boolean => openProjects.has(projectPath),

    dispose(): void {
      for (const controller of activeRequests.values()) controller.abort();
      activeRequests.clear();
      for (const adapter of agentAdapters) adapter.dispose();
      mcpTools.dispose();
      languageServers.dispose();
      bots.stopAll();
      scheduler.stop();
      terminal.stopAll();
      terminals.stopAll();
      db.close();
    },
  };
}
