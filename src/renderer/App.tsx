import {
  Command as CommandIcon,
  Drama,
  Eraser,
  Pencil,
  Plus,
  RotateCcw,
  BarChart3,
  Bot,
  CalendarClock,
  FileText,
  FileDown,
  FolderTree,
  Gauge,
  Library as LibraryIcon,
  Sparkles,
  MessageCircleQuestion,
  MessageSquare,
  Search,
  ScanEye,
  Settings,
  Shrink,
  Stethoscope,
  Square,
  SquarePen,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buildSkillPrompt, expandCommand, type LibraryItem } from "../shared/library";
import { PERSONALITIES } from "../shared/personalities";
import { BoardDialog } from "./BoardDialog";
import { RememberDialog } from "./RememberDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { BotsDialog } from "./BotsDialog";
import { CliOutputDialog, type CliOutput } from "./CliOutputDialog";
import { CommandPalette } from "./CommandPalette";
import { ContextDialog } from "./ContextDialog";
import { sessionToHtml, sessionToMarkdown } from "./exportSession";
import { BUILTIN_COMMAND_NAMES, type Command } from "./commands";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import { Composer, COMPOSER_INPUT_ID } from "./Composer";
import { HistoryDialog, type AskTarget, type HistoryTab } from "./HistoryDialog";
import { LibraryBrowser, LibraryDialog, type LibraryDialogState } from "./LibraryDialog";
import { EmptyState } from "./EmptyState";
import { FilesView } from "./FilesView";
import { formatTokens } from "./lib/format";
import { MemoryPopover } from "./MemoryPopover";
import { Pane } from "./Pane";
import { cn } from "./lib/utils";
import {
  AppearanceSection,
  ConnectionsSection,
  McpSection,
  PermissionsSection,
  PersonaFileEditor,
  ProvidersSection,
} from "./SettingsSections";
import {
  ActivityRail,
  BottomDock,
  PageHeader,
  RolePage,
  RunInspector,
  TopBar,
  type ActivityId,
} from "./Workbench";
import type { ConnectionStatus, PersonaFile, SessionState } from "../shared/types";
import {
  DEFAULT_CLI_MODEL_ID,
  preferredConnection,
  providerMeta,
  readyProviderIds,
  rememberConnectionLabels,
  usesDefaultModel,
} from "./providers";
import {
  createEmptySession,
  loadSessionOrCreate,
  persistSession,
  useHarness,
  type PaneDefaults,
} from "./useHarness";

function folderLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "No project folder";
}

const SETTINGS_TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "providers", label: "Providers" },
  { id: "soul", label: "Soul" },
  { id: "role", label: "Role" },
  { id: "agents", label: "Agents" },
  { id: "skills", label: "Skills" },
  { id: "commands", label: "Commands" },
  { id: "plugins", label: "Plugins" },
  { id: "automation", label: "Automation" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];
const UNTITLED_SESSION = "Untitled session";
// Radix Select cannot use "" as an item value.
const NO_PERSONALITY = "none";
const isMac = navigator.userAgent.includes("Mac");

async function defaultModelFor(connection: ConnectionStatus): Promise<string> {
  if (usesDefaultModel(connection.kind)) return DEFAULT_CLI_MODEL_ID;
  if (connection.kind === "api-key") return "";
  const models = await window.zenith.providers.listModels(connection.id).catch(() => []);
  return models[0]?.id ?? "";
}

export function App() {
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [refreshingConnections, setRefreshingConnections] = useState(false);
  const autoConfiguredSessionId = useRef<string | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  const [activity, setActivity] = useState<ActivityId>("workspace");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [dockOpen, setDockOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boardProject, setBoardProject] = useState<string | null>(null);
  const [botsOpen, setBotsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [composerPrompt, setComposerPrompt] = useState("");
  const [personaVersion, setPersonaVersion] = useState(0);
  const [persona, setPersona] = useState<Record<PersonaFile, string>>({
    "SOUL.md": "",
    "USER.md": "",
  });
  const [history, setHistory] = useState<{ tab: HistoryTab; query: string } | null>(null);
  const {
    session,
    setSession,
    streamingPaneIds,
    agentTurns,
    rollbackTurn,
    compactingPaneIds,
    compactPane,
    permissions,
    respondPermission,
    addPane,
    removePane,
    updatePane,
    setMemoryText,
    setPersonality,
    sendToPane,
    retryPane,
    undoPane,
    abortPane,
    abortAll,
    clearAgentCache,
  } = useHarness(createEmptySession(sessionId), persona, () =>
    setPersonaVersion((value) => value + 1),
  );
  const [rememberText, setRememberText] = useState<string | null>(null);
  const [cliOutput, setCliOutput] = useState<CliOutput | null>(null);
  const [contextPaneId, setContextPaneId] = useState<string | null>(null);

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryDialogState | null>(null);
  const projectPathsKey = [
    ...new Set(session.panes.flatMap((pane) => (pane.projectPath ? [pane.projectPath] : []))),
  ].join("\n");
  const [libraryVersion, setLibraryVersion] = useState(0);
  const projectPaths = projectPathsKey ? projectPathsKey.split("\n") : [];
  const [dockProject, setDockProject] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.zenith.library
      .list(projectPathsKey ? projectPathsKey.split("\n") : [])
      .then((items) => {
        if (!cancelled) setLibrary(items);
      })
      .catch((error: unknown) => console.error("Failed to load the library:", error));
    return () => {
      cancelled = true;
    };
  }, [projectPathsKey, libraryVersion]);

  // Skills and commands run from the composer; the pane shows "/name args" while models get
  // the expanded prompt.
  async function runLibraryItem(item: LibraryItem, argumentsText: string) {
    try {
      const { body } = await window.zenith.library.read(item.path);
      const outgoing =
        item.kind === "skill"
          ? buildSkillPrompt(item, body, argumentsText)
          : expandCommand(body, argumentsText);
      sendToCurrent(`/${item.name}${argumentsText ? ` ${argumentsText}` : ""}`, outgoing);
    } catch (error: unknown) {
      console.error(`Failed to run /${item.name}:`, error);
    }
  }

  useEffect(() => {
    void Promise.all([window.zenith.persona.get("SOUL.md"), window.zenith.persona.get("USER.md")])
      .then(([soul, user]) => setPersona({ "SOUL.md": soul, "USER.md": user }))
      .catch((error: unknown) => console.error("Failed to read persona files:", error));
  }, [personaVersion]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(isMac ? event.metaKey : event.ctrlKey)) return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setHistory({ tab: "search", query: "" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Resume the most recent session instead of minting a new one each launch,
  // which would otherwise persist an untouched session file on every start.
  useEffect(() => {
    let cancelled = false;
    window.zenith.sessions
      .list()
      .then(async (summaries) => {
        const mostRecent = summaries[0];
        if (!mostRecent) return;
        const loaded = await window.zenith.sessions.load(mostRecent.id);
        if (loaded && !cancelled) {
          setSessionId(loaded.id);
          setSession(loaded);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to restore the most recent session:", error);
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  // Streaming changes the session on every chunk, so saves are debounced.
  // ponytail: a force quit can lose the last ~300 ms of edits; flush from main on quit if that matters.
  const pendingSave = useRef<{ session: SessionState; timer: number } | undefined>(undefined);
  const flushPendingSave = () => {
    const pending = pendingSave.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingSave.current = undefined;
    void persistSession(pending.session);
  };

  useEffect(() => {
    if (!restored) return;
    if (pendingSave.current) window.clearTimeout(pendingSave.current.timer);
    const timer = window.setTimeout(() => {
      pendingSave.current = undefined;
      void persistSession(session);
    }, 300);
    pendingSave.current = { session, timer };
  }, [session, restored]);

  useEffect(() => {
    window.addEventListener("beforeunload", flushPendingSave);
    return () => window.removeEventListener("beforeunload", flushPendingSave);
  }, []);

  useEffect(() => {
    window.zenith.connections
      .list()
      .then((list) => {
        rememberConnectionLabels(list);
        setConnections(list);
      })
      .catch((error: unknown) => console.error("Failed to list connections:", error));
  }, [credentialsVersion]);

  // Point untouched panes at the best tool already on this computer, once per session.
  useEffect(() => {
    if (!restored || autoConfiguredSessionId.current === sessionId) return;
    const preferred = preferredConnection(connections);
    if (!preferred) return;
    const ready = new Set(readyProviderIds(connections));
    let cancelled = false;
    void defaultModelFor(preferred).then((modelId) => {
      if (cancelled) return;
      autoConfiguredSessionId.current = sessionId;
      setSession((current) => {
        let changed = false;
        const panes = current.panes.map((pane) => {
          const untouched =
            pane.messages.length === 0 && pane.lastError === null && !ready.has(pane.providerId);
          if (!untouched) return pane;
          changed = true;
          return { ...pane, providerId: preferred.id, modelId };
        });
        return changed ? { ...current, panes } : current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [restored, connections, sessionId, setSession]);

  async function refreshConnections() {
    setRefreshingConnections(true);
    try {
      const list = await window.zenith.connections.list(true);
      rememberConnectionLabels(list);
      setConnections(list);
    } catch (error: unknown) {
      console.error("Failed to refresh connections:", error);
    } finally {
      setRefreshingConnections(false);
    }
  }

  const readyProviders = readyProviderIds(connections);
  const preferred = preferredConnection(connections);
  const paneDefaults: PaneDefaults | undefined = preferred && {
    providerId: preferred.id,
    modelId: usesDefaultModel(preferred.kind) ? DEFAULT_CLI_MODEL_ID : "",
  };
  const readyToolCount = connections.filter(
    (connection) => connection.kind !== "api-key" && connection.state === "ready",
  ).length;

  async function selectSession(id: string) {
    flushPendingSave();
    const loaded = await loadSessionOrCreate(id);
    setSessionId(id);
    setSession(loaded);
  }

  async function createSession() {
    flushPendingSave();
    const id = crypto.randomUUID();
    setSessionId(id);
    setSession(createEmptySession(id, paneDefaults));
  }

  async function deleteSession(id: string) {
    if (pendingSave.current?.session.id === id) {
      window.clearTimeout(pendingSave.current.timer);
      pendingSave.current = undefined;
    }
    await window.zenith.sessions.delete(id);
    if (id === sessionId) await createSession();
  }

  const totalTokens = session.panes.reduce(
    (sum, pane) => sum + pane.promptTokens + pane.completionTokens,
    0,
  );
  const memoryPaneCount = session.panes.filter((pane) => pane.memoryEnabled).length;

  // Puts "/name " in the composer so the user can type the command's argument.
  function promptForArgument(name: string) {
    setComposerPrompt(`/${name} `);
    requestAnimationFrame(() => document.getElementById(COMPOSER_INPUT_ID)?.focus());
  }

  // Multiple panes are on hold: each session shows and sends to its first pane only. Extra panes
  // in older sessions are kept, not deleted.
  const pane = session.panes[0];
  function sendToCurrent(prompt: string, outgoing = prompt) {
    const current = session.panes[0];
    if (current) sendToPane(current, prompt, outgoing);
  }

  // A new approval opens the bottom panel (on its Approvals tab), so a waiting agent is noticed.
  const pendingCount = permissions.length;
  const [seenPending, setSeenPending] = useState(pendingCount);
  if (pendingCount !== seenPending) {
    setSeenPending(pendingCount);
    if (pendingCount > seenPending) setDockOpen(true);
  }

  const askTargets: AskTarget[] = session.panes
    .filter((item) => item.modelId !== "" && readyProviders.includes(item.providerId))
    .filter(
      (item, index, all) =>
        all.findIndex((p) => p.providerId === item.providerId && p.modelId === item.modelId) ===
        index,
    )
    .map((item) => ({
      id: `${item.providerId}:${item.modelId}`,
      label:
        item.modelId === DEFAULT_CLI_MODEL_ID
          ? providerMeta(item.providerId).label
          : `${providerMeta(item.providerId).label} · ${item.modelId}`,
      providerId: item.providerId,
      modelId: item.modelId,
    }));

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setActivity("settings");
  };

  // Claude Code's own commands, run by the CLI without a model call.
  function runClaudeCommand(name: string, title: string, description: string) {
    setCliOutput({ title, description, text: null });
    window.zenith.cli
      .claudeCommand(name)
      .then((text) => setCliOutput({ title, description, text }))
      .catch((error: unknown) =>
        setCliOutput({
          title,
          description,
          text: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  async function exportSession(kind: "markdown" | "html") {
    try {
      await window.zenith.files.saveAs({
        suggestedName: `${session.name || UNTITLED_SESSION}.${kind === "html" ? "html" : "md"}`,
        content: kind === "html" ? sessionToHtml(session) : sessionToMarkdown(session),
        kind,
      });
    } catch (error: unknown) {
      console.error("Export failed:", error);
    }
  }

  // Starts a new session holding this conversation up to and including one message.
  function branchToSession(messageId: string) {
    const source = session.panes[0];
    if (!source) return;
    const index = source.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    flushPendingSave();
    const id = crypto.randomUUID();
    const messages = source.messages.slice(0, index + 1);
    setSessionId(id);
    setSession({
      ...session,
      id,
      name: `${session.name} (branch)`,
      updatedAt: Date.now(),
      panes: [
        {
          ...source,
          id: crypto.randomUUID(),
          messages,
          promptTokens: 0,
          completionTokens: 0,
          lastError: null,
        },
      ],
    });
    setActivity("workspace");
  }

  const builtinCommands: Command[] = [
    {
      name: "context",
      title: "Show what the model saw in the last request",
      icon: ScanEye,
      run: () => pane && setContextPaneId(pane.id),
    },
    {
      name: "export",
      title: "Export this conversation",
      icon: FileDown,
      argument: "markdown | html",
      run: (value) =>
        void exportSession(value.trim().toLowerCase() === "html" ? "html" : "markdown"),
    },
    {
      name: "usage",
      title: "Claude Code: subscription usage and limits",
      icon: Gauge,
      run: () =>
        runClaudeCommand(
          "/usage",
          "Claude Code · /usage",
          "What Claude Code reports about your subscription limits on this computer.",
        ),
    },
    {
      name: "cost",
      title: "Claude Code: session and weekly cost",
      icon: BarChart3,
      run: () =>
        runClaudeCommand("/cost", "Claude Code · /cost", "What Claude Code reports about cost."),
    },
    {
      name: "model",
      title: "Claude Code: current model and the ids it accepts",
      icon: Sparkles,
      run: () =>
        runClaudeCommand(
          "/model",
          "Claude Code · /model",
          "The model Claude Code uses by default, and the names it accepts in a pane.",
        ),
    },
    {
      name: "doctor",
      title: "Claude Code: check the installation",
      icon: Stethoscope,
      run: () =>
        runClaudeCommand(
          "/doctor",
          "Claude Code · /doctor",
          "Claude Code's own check of its installation and settings.",
        ),
    },
    { name: "new", title: "New session", icon: SquarePen, run: () => void createSession() },
    {
      name: "retry",
      title: "Retry the last prompt",
      icon: RotateCcw,
      run: () => pane && retryPane(pane.id),
    },
    {
      name: "undo",
      title: "Undo the last exchange",
      icon: Undo2,
      run: () => pane && undoPane(pane.id),
    },
    { name: "stop", title: "Stop the reply", icon: Square, run: abortAll },
    {
      name: "clear",
      title: "Clear the conversation",
      icon: Eraser,
      run: () => {
        if (!pane) return;
        abortAll();
        updatePane(pane.id, {
          messages: [],
          promptTokens: 0,
          completionTokens: 0,
          lastError: null,
        });
      },
    },
    {
      name: "compact",
      title: "Summarize older messages",
      icon: Shrink,
      run: () => pane && void compactPane(pane.id),
    },
    {
      name: "search",
      title: "Search all sessions",
      icon: Search,
      argument: "<words>",
      run: (query) => setHistory({ tab: "search", query }),
    },
    {
      name: "ask",
      title: "Ask a question about your history",
      icon: MessageCircleQuestion,
      argument: "<question>",
      run: (question) => setHistory({ tab: "ask", query: question }),
    },
    {
      name: "insights",
      title: "Usage insights",
      icon: BarChart3,
      run: () => setHistory({ tab: "insights", query: "" }),
    },
    {
      name: "title",
      title: "Rename this session",
      icon: Pencil,
      argument: "<name>",
      run: (name) => {
        if (!name) return promptForArgument("title");
        setSession((current) => ({ ...current, name }));
      },
    },
    {
      name: "personality",
      title: "Set the session role",
      icon: Drama,
      argument: PERSONALITIES.map((p) => p.id || NO_PERSONALITY).join(" | "),
      run: (value) => {
        if (!value) return promptForArgument("personality");
        const wanted = value.toLowerCase();
        const match = PERSONALITIES.find(
          (p) => p.label.toLowerCase() === wanted || (p.id || NO_PERSONALITY) === wanted,
        );
        if (match) setPersonality(match.id);
      },
    },
    {
      name: "bots",
      title: "Bots for Telegram, Discord, Slack, WhatsApp, Signal, and Home Assistant",
      icon: Bot,
      run: () => setBotsOpen(true),
    },
    {
      name: "schedule",
      title: "Scheduled tasks",
      icon: CalendarClock,
      run: () => setScheduleOpen(true),
    },
    {
      name: "settings",
      title: "Settings: providers, themes, soul, library, plugins",
      icon: Settings,
      run: () => openSettings("appearance"),
    },
    {
      name: "help",
      title: "Show all commands",
      icon: CommandIcon,
      run: () => setPaletteOpen(true),
    },
  ];

  const commands: Command[] = [
    ...builtinCommands,
    {
      name: "library",
      title: "Skills, commands, and agents",
      icon: LibraryIcon,
      run: () => openSettings("skills"),
    },
    ...library
      .filter((item) => item.kind !== "agent" && !BUILTIN_COMMAND_NAMES.has(item.name))
      .map((item): Command => ({
        name: item.name,
        title: `${item.kind === "skill" ? "Skill" : "Command"}: ${item.description}`,
        icon: item.kind === "skill" ? Sparkles : FileText,
        argument: item.argumentHint || "<task>",
        run: (argumentsText) => void runLibraryItem(item, argumentsText),
      })),
  ];

  async function savePersona(file: PersonaFile, text: string) {
    await window.zenith.persona.set(file, text);
    setPersona((current) => ({ ...current, [file]: text }));
  }

  const dockProjectPath =
    dockProject && projectPaths.includes(dockProject)
      ? dockProject
      : (pane?.projectPath ?? projectPaths[0] ?? null);
  const agentName = pane?.agentPath
    ? (library.find((item) => item.path === pane.agentPath)?.name ??
      pane.agentPath.split(/[\\/]/).at(-1)?.replace(/\.md$/, "") ??
      "agent")
    : null;
  const refreshLibrary = () => {
    clearAgentCache();
    setLibraryVersion((value) => value + 1);
  };
  const libraryKinds: Partial<Record<SettingsTab, LibraryItem["kind"]>> = {
    agents: "agent",
    skills: "skill",
    commands: "command",
  };
  const libraryKind = libraryKinds[settingsTab];
  const settingsDescriptions: Record<SettingsTab, string> = {
    appearance: "How Zenith looks.",
    providers: "AI tools on this computer and API providers with their own address and key.",
    soul: "Who every model is and what it knows about you, sent as the system prompt.",
    role: "The personality this session follows, added after the soul and profile.",
    agents: "Instructions and tool lists a pane can follow. Choose one from the pane's menu.",
    skills: "Instructions you run with /name in the composer.",
    commands: "Prompt templates you run with /name; $ARGUMENTS is replaced with what you type.",
    plugins: "MCP servers add tools to agents; permission rules decide what runs without asking.",
    automation: "Bots, scheduled tasks, and usage insights.",
  };

  const workspaceView = (
    <>
      <PageHeader
        compact
        eyebrow="Session"
        title={
          <input
            aria-label="Session name"
            value={session.name}
            onChange={(event) =>
              setSession((current) => ({ ...current, name: event.target.value }))
            }
            onBlur={() => {
              if (session.name.trim() === "") {
                setSession((current) => ({ ...current, name: UNTITLED_SESSION }));
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="w-full max-w-[28rem] border border-transparent bg-transparent px-1 font-serif text-lg text-foreground transition-colors hover:border-border focus:border-ring focus:outline-none"
          />
        }
        description={`${formatTokens(totalTokens)} tokens${session.personalityId ? ` · role: ${PERSONALITIES.find((item) => item.id === session.personalityId)?.label ?? session.personalityId}` : ""}`}
        actions={
          <MemoryPopover
            memoryText={session.memoryText}
            enabledPaneCount={memoryPaneCount}
            paneCount={session.panes.length}
            onChange={setMemoryText}
          />
        }
      />

      <div className="min-h-0 flex-1 bg-background">
        {pane ? (
          <Pane
            pane={pane}
            singlePane
            credentialsVersion={credentialsVersion}
            connections={connections}
            streaming={streamingPaneIds.has(pane.id)}
            agentTurn={agentTurns[pane.id]}
            onRollback={() => rollbackTurn(pane.id)}
            onOpenBoard={setBoardProject}
            onOpenWorkspace={(path) => {
              setDockProject(path);
              setDockOpen(true);
            }}
            agentName={agentName}
            onChooseAgent={() => setLibraryState({ kind: "agent", pickForPaneId: pane.id })}
            onRemember={setRememberText}
            onBuildPlan={() => {
              const building = { ...pane, planMode: false };
              updatePane(pane.id, { planMode: false });
              sendToPane(building, "Build the plan above. Make the changes step by step.");
            }}
            compacting={compactingPaneIds.has(pane.id)}
            onCompact={() => void compactPane(pane.id)}
            permissions={permissions.filter((request) => request.paneId === pane.id)}
            onRespondPermission={respondPermission}
            onChange={(patch) => updatePane(pane.id, patch)}
            onRemove={() => removePane(pane.id)}
            onSend={(prompt) => sendToPane(pane, prompt)}
            onRetry={() => retryPane(pane.id)}
            onUndo={() => undoPane(pane.id)}
            onBranch={branchToSession}
            onExport={(kind) => void exportSession(kind)}
            onShowContext={() => setContextPaneId(pane.id)}
            onStop={() => abortPane(pane.id)}
            onOpenSettings={() => openSettings("providers")}
          />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="No conversation yet"
            description="Start a conversation in this session."
            action={
              <Button size="sm" onClick={() => addPane(paneDefaults)}>
                <Plus />
                Start
              </Button>
            }
          />
        )}
      </div>

      <Composer
        panes={session.panes.slice(0, 1)}
        readyProviders={readyProviders}
        commands={commands}
        prompt={composerPrompt}
        streaming={streamingPaneIds.size > 0}
        onPromptChange={setComposerPrompt}
        onSend={sendToCurrent}
        onStop={abortAll}
      />
    </>
  );

  const narrow = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5">{children}</div>
  );

  const filesView = (
    <>
      <PageHeader
        compact
        eyebrow="Project"
        title={
          projectPaths.length > 1 ? (
            <select
              aria-label="Project folder"
              value={dockProjectPath ?? ""}
              onChange={(event) => setDockProject(event.target.value)}
              className="max-w-[20rem] cursor-pointer truncate border border-transparent bg-transparent font-serif text-lg hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {projectPaths.map((path) => (
                <option key={path} value={path} title={path}>
                  {folderLabel(path)}
                </option>
              ))}
            </select>
          ) : (
            folderLabel(dockProjectPath ?? "")
          )
        }
        description={dockProjectPath ?? ""}
      />
      {dockProjectPath ? (
        <FilesView key={dockProjectPath} projectPath={dockProjectPath} />
      ) : (
        <EmptyState
          icon={FolderTree}
          title="No project folder yet"
          description="Choose a folder in the conversation header, then read and preview its files here."
          action={
            <Button size="sm" onClick={() => setActivity("workspace")}>
              Go to the conversation
            </Button>
          }
        />
      )}
    </>
  );

  const settingsView = (
    <>
      <PageHeader
        eyebrow="Profiles and connections"
        title="Settings"
        description={settingsDescriptions[settingsTab]}
      />
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card px-4"
      >
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={settingsTab === tab.id}
            onClick={() => setSettingsTab(tab.id)}
            className={cn(
              "-mb-px shrink-0 cursor-pointer border-b-2 px-2.5 py-2.5 font-mono text-[11px] tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              settingsTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {libraryKind ? (
        <div className="flex min-h-0 flex-1 flex-col p-5">
          <LibraryBrowser
            key={libraryKind}
            kind={libraryKind}
            items={library}
            onChanged={refreshLibrary}
          />
        </div>
      ) : (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
          {settingsTab === "appearance" && narrow(<AppearanceSection />)}
          {settingsTab === "providers" &&
            narrow(
              <>
                <ProvidersSection onChanged={() => setCredentialsVersion((value) => value + 1)} />
                <ConnectionsSection
                  connections={connections}
                  refreshing={refreshingConnections}
                  onRefresh={() => void refreshConnections()}
                />
              </>,
            )}
          {settingsTab === "soul" &&
            narrow(
              <>
                <PersonaFileEditor
                  file="SOUL.md"
                  title="Soul"
                  description="Sent first to every conversation, before your profile, the session role, and memory."
                  placeholder="e.g. You are a direct senior engineer. Match answer length to the question."
                  text={persona["SOUL.md"]}
                  onSave={savePersona}
                />
                <PersonaFileEditor
                  file="USER.md"
                  title="About you"
                  description="What every model should know about you: role, preferences, projects. Agents can add to it with your approval."
                  placeholder="e.g. I'm a TypeScript developer on macOS. I prefer short answers with code."
                  text={persona["USER.md"]}
                  onSave={savePersona}
                />
              </>,
            )}
          {settingsTab === "role" && (
            <RolePage personalityId={session.personalityId} onChange={setPersonality} />
          )}
          {settingsTab === "plugins" &&
            narrow(
              <>
                <McpSection />
                <PermissionsSection />
              </>,
            )}
          {settingsTab === "automation" &&
            narrow(
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                {[
                  {
                    icon: Bot,
                    title: "Bots",
                    text: "Chat with Zenith from Telegram, Discord, Slack, WhatsApp, Signal, or Home Assistant. Only people you pair are answered, and bots never run tools.",
                    open: () => setBotsOpen(true),
                  },
                  {
                    icon: CalendarClock,
                    title: "Scheduled tasks",
                    text: "Run a prompt on a schedule while Zenith is open, and get the result here or through a bot.",
                    open: () => setScheduleOpen(true),
                  },
                  {
                    icon: BarChart3,
                    title: "Usage insights",
                    text: "Tokens and messages by connection and model across all your sessions.",
                    open: () => setHistory({ tab: "insights", query: "" }),
                  },
                ].map((card) => (
                  <li key={card.title}>
                    <button
                      type="button"
                      onClick={card.open}
                      className="flex h-full w-full cursor-pointer flex-col gap-2 border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <card.icon className="size-5 text-primary" aria-hidden />
                      <span className="text-sm font-medium">{card.title}</span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {card.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>,
            )}
        </div>
      )}
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen grid-cols-[224px_minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
        <TopBar
          crumbs={
            activity === "workspace"
              ? ["Workspace", session.name || UNTITLED_SESSION]
              : activity === "files"
                ? ["Files", folderLabel(dockProjectPath ?? "")]
                : ["Settings", SETTINGS_TABS.find((tab) => tab.id === settingsTab)?.label ?? ""]
          }
          connectedCount={readyToolCount}
          streaming={streamingPaneIds.size > 0}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((open) => !open)}
          pendingCount={pendingCount}
          inspector={
            <RunInspector
              pane={pane}
              agentTurn={pane ? agentTurns[pane.id] : undefined}
              agentName={agentName}
              streaming={pane ? streamingPaneIds.has(pane.id) : false}
              pendingCount={pendingCount}
              persona={persona}
              personalityId={session.personalityId}
              skillCount={library.filter((item) => item.kind === "skill").length}
              commandCount={library.filter((item) => item.kind === "command").length}
              connections={connections}
              onOpenSettings={() => openSettings("providers")}
              onShowContext={() => pane && setContextPaneId(pane.id)}
            />
          }
        />

        <ActivityRail
          active={activity}
          onSelect={setActivity}
          activeSessionId={sessionId}
          activeSessionName={session.name}
          onSelectSession={(id) => void selectSession(id)}
          onCreateSession={() => {
            void createSession();
            setActivity("workspace");
          }}
          onDeleteSession={deleteSession}
          onOpenHistory={() => setHistory({ tab: "search", query: "" })}
          onOpenSchedule={() => setScheduleOpen(true)}
          onOpenBots={() => setBotsOpen(true)}
        />

        <main className="workbench-grid flex min-h-0 min-w-0 flex-col">
          {activity === "workspace"
            ? workspaceView
            : activity === "files"
              ? filesView
              : settingsView}
        </main>

        <BottomDock
          open={dockOpen}
          onOpenChange={setDockOpen}
          projects={projectPaths}
          projectPath={dockProjectPath}
          onProjectChange={setDockProject}
          refreshKey={streamingPaneIds.size}
          panes={session.panes.slice(0, 1)}
          agentTurns={agentTurns}
          permissions={permissions}
          onRespondPermission={respondPermission}
          onOpenWorktree={(path) => pane && updatePane(pane.id, { projectPath: path })}
        />

        <HistoryDialog
          state={history}
          askTargets={askTargets}
          onStateChange={setHistory}
          onOpenSession={(id) => {
            setHistory(null);
            setActivity("workspace");
            void selectSession(id);
          }}
        />
        <BoardDialog projectPath={boardProject} onClose={() => setBoardProject(null)} />
        <RememberDialog
          text={rememberText}
          onClose={() => setRememberText(null)}
          onSave={async (fact, target) => {
            const line = `- ${fact.replace(/\s+/g, " ").trim()}`;
            if (target === "profile") {
              const current = await window.zenith.persona.get("USER.md");
              await window.zenith.persona.set(
                "USER.md",
                `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`,
              );
              setPersonaVersion((value) => value + 1);
            } else {
              setMemoryText(
                `${session.memoryText.trimEnd()}${session.memoryText.trim() ? "\n" : ""}${line}`,
              );
            }
          }}
        />
        <BotsDialog open={botsOpen} onOpenChange={setBotsOpen} connections={connections} />
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          connections={connections}
        />
        <LibraryDialog
          state={libraryState}
          items={library}
          onStateChange={setLibraryState}
          onChanged={refreshLibrary}
          onPickAgent={(paneId, agentPath) => updatePane(paneId, { agentPath })}
        />
        <CliOutputDialog output={cliOutput} onClose={() => setCliOutput(null)} />
        <ContextDialog paneId={contextPaneId} onClose={() => setContextPaneId(null)} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      </div>
    </TooltipProvider>
  );
}
