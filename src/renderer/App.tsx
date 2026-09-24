import {
  Command as CommandIcon,
  Drama,
  Eraser,
  Pencil,
  Plus,
  RotateCcw,
  BarChart3,
  Bot,
  Columns3,
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

import { denyOptionId, denyRuleFor } from "../shared/deny-rule";
import { buildSkillPrompt, expandCommand, type LibraryItem } from "../shared/library";
import { PERSONALITIES } from "../shared/personalities";
import { BoardDialog } from "./BoardDialog";
import { RememberDialog } from "./RememberDialog";
import { ScheduleDialog } from "./ScheduleDialog";
import { SessionTabs } from "./SessionTabs";
import { BotsDialog } from "./BotsDialog";
import { CliOutputDialog, type CliOutput } from "./CliOutputDialog";
import { CommandPalette } from "./CommandPalette";
import { ContextDialog } from "./ContextDialog";
import { sessionToHtml, sessionToMarkdown } from "./exportSession";
import { BUILTIN_COMMAND_NAMES, type Command } from "./commands";
import { Button } from "./components/ui/button";
import { TooltipProvider } from "./components/ui/tooltip";
import { Composer, COMPOSER_INPUT_ID } from "./Composer";
import { CompareDialog, CompareView, type ActiveComparison } from "./Compare";
import { HistoryDialog, type AskTarget, type HistoryTab } from "./HistoryDialog";
import { LibraryDialog, type LibraryDialogState, type LibraryDraft } from "./LibraryDialog";
import { EmptyState } from "./EmptyState";
import { useExtras } from "./extras";
import { BrowserView } from "./BrowserView";
import { FilesView } from "./FilesView";
import { GoalsView } from "./GoalsView";
import { leftoverNotice } from "./lib/format";
import { MemoryPopover } from "./MemoryPopover";
import { Pane } from "./Pane";
import { SettingsDialog, type AgentBehaviourSection, type SettingsTab } from "./SettingsDialog";
import { closeTab, cycleTab, openTab, saveTabs, storedTabs, tabForDigit } from "./tabList";
import {
  ActivityRail,
  BottomDock,
  PageHeader,
  RunInspector,
  TopBar,
  type ActivityId,
  type DockTab,
  type SessionStatus,
} from "./Workbench";
import { ReviewBar, TodoStrip } from "./AgentPanel";
import type {
  Comparison,
  ConnectionStatus,
  ImageAttachment,
  PaneState,
  PermissionRequest,
  PersonaFile,
  SessionState,
} from "../shared/types";
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
  createPane,
  loadSessionOrCreate,
  persistSession,
  useHarness,
  type PaneDefaults,
} from "./useHarness";

// Rebuilds the comparison view from what survives a restart: the stored comparison, and this
// session's panes working in its worktrees. Null when none of its runs are in this session.
function reopenComparison(
  comparison: Comparison,
  sessionId: string,
  panes: PaneState[],
): ActiveComparison | null {
  const runPanes = comparison.runs.flatMap((run) => {
    const pane = panes.find((item) => item.projectPath === run.path);
    return pane ? [{ providerId: run.providerId, pane }] : [];
  });
  const first = runPanes[0]?.pane;
  if (!first) return null;
  return {
    ...comparison,
    sessionId,
    // Every run was sent the same prompt as its first message.
    prompt: first.messages.find((message) => message.role === "user")?.content ?? "",
    paneIds: Object.fromEntries(runPanes.map((item) => [item.providerId, item.pane.id])),
    outcome: null,
  };
}

function folderLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "No project folder";
}

// Every place that used to call openSettings("<old tab id>") keeps working:
// each old id still names a single destination, now expressed as a tab plus,
// for the merged Agent behaviour tab, the sub-section to land on.
const SETTINGS_DESTINATIONS = {
  appearance: { tab: "general" },
  extras: { tab: "general" },
  providers: { tab: "assistants" },
  soul: { tab: "agent-behaviour", section: "soul" },
  role: { tab: "agent-behaviour", section: "role" },
  agents: { tab: "agent-behaviour", section: "agents" },
  skills: { tab: "agent-behaviour", section: "skills" },
  commands: { tab: "agent-behaviour", section: "commands" },
  plugins: { tab: "safety" },
} as const satisfies Record<string, { tab: SettingsTab; section?: AgentBehaviourSection }>;
type SettingsDestination = keyof typeof SETTINGS_DESTINATIONS;
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
  // The sessions open as tabs in the top bar, in strip order; the open session always has one.
  const [openTabs, setOpenTabs] = useState<readonly string[]>(() => [sessionId]);
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [refreshingConnections, setRefreshingConnections] = useState(false);
  const autoConfiguredSessionId = useRef<string | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  const [activity, setActivity] = useState<ActivityId>("workspace");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browserTitle, setBrowserTitle] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [agentSection, setAgentSection] = useState<AgentBehaviourSection>("soul");
  const [dockOpen, setDockOpen] = useState(false);
  const [composerControls, setComposerControls] = useState<HTMLElement | null>(null);
  const [dockShowTab, setDockShowTab] = useState<{ tab: DockTab; at: number }>();
  // Replies whose changes the user kept, so the review bar stops asking.
  const [keptTurnIds, setKeptTurnIds] = useState<ReadonlySet<string>>(new Set());
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
  // The compare dialog's starting prompt while it is open, and the comparison under way.
  const [compareDraft, setCompareDraft] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ActiveComparison | null>(null);
  // Comparisons not yet kept or discarded, so one left open when Zenith quit can be reopened.
  const [unfinished, setUnfinished] = useState<Comparison[]>([]);
  const { extras, setExtra } = useExtras();
  const {
    session,
    setSession,
    streamingPaneIds,
    runningSessions,
    agentTurns,
    notices,
    rollbackTurn,
    rollbackFile,
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
    queuedPrompt,
    queuePrompt,
    cancelQueue,
    retryPane,
    undoPane,
    restoreTo,
    abortPane,
    abortAll,
    clearAgentCache,
  } = useHarness(createEmptySession(sessionId), persona, () =>
    setPersonaVersion((value) => value + 1),
  );
  const [rememberText, setRememberText] = useState<string | null>(null);
  const [cliOutput, setCliOutput] = useState<CliOutput | null>(null);
  const [contextPaneId, setContextPaneId] = useState<string | null>(null);
  // A skill drafted from a conversation, opened in Settings → Agent behaviour → Skills; the number
  // remounts the editor.
  const [skillDraft, setSkillDraft] = useState<{ draft: LibraryDraft; version: number } | null>(
    null,
  );

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryDialogState | null>(null);
  const projectPathsKey = [
    ...new Set(session.panes.flatMap((pane) => (pane.projectPath ? [pane.projectPath] : []))),
  ].join("\n");
  const [libraryVersion, setLibraryVersion] = useState(0);
  // Bumped when the permission rules change, so the composer's facts re-read them.
  const [guardVersion, setGuardVersion] = useState(0);
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

  // Re-read whenever a comparison starts, ends, or the session changes.
  useEffect(() => {
    let cancelled = false;
    window.zenith.compare
      .unfinished()
      .then((list) => !cancelled && setUnfinished(list))
      .catch((error: unknown) => console.error("Failed to list unfinished comparisons:", error));
    return () => {
      cancelled = true;
    };
  }, [session.id, comparison]);

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
      } else if (event.key.toLowerCase() === "k" && !event.shiftKey) {
        // Cmd/Ctrl+Shift+K is the review bar's Keep.
        event.preventDefault();
        setHistory({ tab: "search", query: "" });
      } else if (event.key === ",") {
        // Cmd+, opens Settings, as in every macOS app; Ctrl+, elsewhere.
        event.preventDefault();
        setSettingsOpen(true);
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
          // Focusing a tab saves its session, so the most recent session is the tab last open.
          setOpenTabs(openTab(storedTabs(summaries.map((summary) => summary.id)), loaded.id));
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
    if (restored) saveTabs(openTabs);
  }, [openTabs, restored]);

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

  // Every session that opens gets a tab, or focuses the one it has.
  function showSession(id: string) {
    setSessionId(id);
    setOpenTabs((tabs) => openTab(tabs, id));
  }

  // A reply still running in the session being left is not stopped: it keeps streaming, and
  // shows again if its tab is focused before it ends (see useHarness).
  async function selectSession(id: string) {
    flushPendingSave();
    const loaded = await loadSessionOrCreate(id);
    showSession(id);
    setSession(loaded);
  }

  async function createSession() {
    flushPendingSave();
    const id = crypto.randomUUID();
    showSession(id);
    setSession(createEmptySession(id, paneDefaults));
  }

  // Closing a tab keeps its session in the rail. Closing the open tab moves to its neighbour, or
  // to a new empty session when it was the last, so a tab is always open.
  function closeSessionTab(id: string) {
    const { tabs, next } = closeTab(openTabs, id);
    setOpenTabs(tabs);
    if (id !== sessionId) return;
    if (next) void selectSession(next);
    else void createSession();
  }

  function focusTab(id: string) {
    setActivity("workspace");
    if (id !== sessionId) void selectSession(id);
  }

  // Safari's tab keys. The listener is added once and reads the latest tabs through a ref.
  const onTabKey = useRef<(event: KeyboardEvent) => void>(undefined);
  useEffect(() => {
    onTabKey.current = (event) => {
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const next = cycleTab(openTabs, sessionId, event.shiftKey ? -1 : 1);
        if (next) focusTab(next);
        return;
      }
      if (!(isMac ? event.metaKey : event.ctrlKey) || event.shiftKey || event.altKey) return;
      // Elsewhere than macOS these are the terminal's own keys, such as Ctrl+W to delete a word.
      if (!isMac && event.target instanceof Element && event.target.closest(".xterm")) return;
      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        setActivity("workspace");
        void createSession();
      } else if (key === "w") {
        // Main keeps the menu from closing the window on this key (see index.ts). Tabs only show
        // on the Workspace, so elsewhere the key does nothing rather than close an unseen tab.
        event.preventDefault();
        if (activity === "workspace") closeSessionTab(sessionId);
      } else if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        const target = tabForDigit(openTabs, Number(key));
        if (target) focusTab(target);
      }
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onTabKey.current?.(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function deleteSession(id: string) {
    if (pendingSave.current?.session.id === id) {
      window.clearTimeout(pendingSave.current.timer);
      pendingSave.current = undefined;
    }
    await window.zenith.sessions.delete(id);
    closeSessionTab(id);
  }

  const memoryPaneCount = session.panes.filter((pane) => pane.memoryEnabled).length;

  // Puts "/name " in the composer so the user can type the command's argument.
  function promptForArgument(name: string) {
    setComposerPrompt(`/${name} `);
    requestAnimationFrame(() => document.getElementById(COMPOSER_INPUT_ID)?.focus());
  }

  // Multiple panes are on hold: each session shows and sends to its first pane only. Extra panes
  // in older sessions are kept, not deleted.
  // Rules for actions already denied in this session, so the second time the card can offer one.
  const [deniedRules, setDeniedRules] = useState<string[]>([]);

  function rememberDenial(request: PermissionRequest) {
    const rule = denyRuleFor(request);
    if (!rule) return;
    setDeniedRules((current) => (current.includes(rule) ? current : [...current, rule]));
  }

  async function alwaysDeny(request: PermissionRequest, rule: string) {
    const current = await window.zenith.permissions.get().catch(() => "");
    const text = current.trim() === "" ? rule : `${current.trim()}\n${rule}`;
    const error = await window.zenith.permissions.set(text);
    if (error) {
      console.error("Failed to save the rule:", error);
      return;
    }
    setGuardVersion((value) => value + 1);
    respondPermission(request.permissionId, denyOptionId(request));
  }

  const pane = session.panes[0];
  // What the run is doing right now, in one sentence, for the composer.
  const runningActivity = pane
    ? agentTurns[pane.id]?.activities.findLast((activity) => activity.status === "running")
    : undefined;
  const runStatus =
    pane && streamingPaneIds.has(pane.id)
      ? permissions.length > 0
        ? "waiting for your approval"
        : (runningActivity?.title ?? notices[pane.id] ?? "thinking…")
      : null;

  // A prompt written during a run waits its turn instead of being refused.
  function sendToCurrent(prompt: string, outgoing = prompt, images: ImageAttachment[] = []) {
    const current = session.panes[0];
    if (!current) return;
    if (streamingPaneIds.size > 0) {
      queuePrompt(prompt, images);
      return;
    }
    sendToPane(current, prompt, outgoing, images);
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

  const openSettings = (destination: SettingsDestination) => {
    const target = SETTINGS_DESTINATIONS[destination];
    setSettingsTab(target.tab);
    if ("section" in target) setAgentSection(target.section);
    setSettingsOpen(true);
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

  // Drafts a skill from the request that led to a reply and the reply itself.
  function saveAsSkill(messageId: string) {
    const messages = session.panes[0]?.messages ?? [];
    const index = messages.findIndex((message) => message.id === messageId);
    const reply = messages[index];
    if (!reply) return;
    const request = messages
      .slice(0, index)
      .findLast((message) => message.role === "user")?.content;
    const name =
      session.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "new-skill";
    setSkillDraft({
      version: Date.now(),
      draft: {
        name,
        description: (request ?? session.name).replace(/\s+/g, " ").slice(0, 140),
        tools: "",
        body: [
          `Use this skill when the user asks for something like: ${request ?? session.name}`,
          "",
          "## What worked before",
          "",
          reply.content,
          "",
          "## Steps",
          "",
          "1. Edit these steps into a short, repeatable procedure before saving.",
        ].join("\n"),
      },
    });
    openSettings("skills");
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
    showSession(id);
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

  // Every run is a pane of this session working in its own worktree, hidden from the single-pane
  // view and left out of broadcasts; the comparison view shows them side by side.
  async function startComparison(providerIds: string[], prompt: string) {
    const projectPath = pane?.projectPath;
    if (!projectPath) throw new Error("Choose a project folder first.");
    const started = await window.zenith.compare.start(projectPath, providerIds, prompt);
    const runPanes = await Promise.all(
      started.runs.map(async (run) => {
        const connection = connections.find((item) => item.id === run.providerId);
        const modelId = connection ? await defaultModelFor(connection) : DEFAULT_CLI_MODEL_ID;
        return {
          ...createPane(crypto.randomUUID(), { providerId: run.providerId, modelId }),
          name: providerMeta(run.providerId).label,
          included: false,
          projectPath: run.path,
        };
      }),
    );
    setSession((current) => ({ ...current, panes: [...current.panes, ...runPanes] }));
    setComparison({
      ...started,
      sessionId: session.id,
      prompt,
      paneIds: Object.fromEntries(runPanes.map((item) => [item.providerId, item.id])),
      outcome: null,
    });
    for (const runPane of runPanes) sendToPane(runPane, prompt);
  }

  // Keep and discard both remove the worktrees, so every run stops first.
  async function keepRun(providerId: string) {
    if (!comparison) return;
    for (const paneId of Object.values(comparison.paneIds)) abortPane(paneId);
    const { applied, leftovers } = await window.zenith.compare.keep(
      comparison.projectPath,
      comparison.id,
      providerId,
    );
    const outcome =
      applied === 0
        ? `${providerMeta(providerId).label} changed no files, so nothing was applied. Worktrees removed.`
        : `Applied ${providerMeta(providerId).label}'s changes to ${folderLabel(comparison.projectPath)}: ${applied} ${applied === 1 ? "file" : "files"}, staged and ready to commit. Worktrees removed.`;
    setComparison({ ...comparison, outcome: outcome + leftoverNotice(leftovers) });
  }

  async function discardComparison() {
    if (!comparison) return;
    for (const paneId of Object.values(comparison.paneIds)) abortPane(paneId);
    const leftovers = await window.zenith.compare.discard(comparison.projectPath, comparison.id);
    setComparison({
      ...comparison,
      outcome: `Discarded the comparison. Your project is unchanged.${leftoverNotice(leftovers)}`,
    });
  }

  function closeComparison() {
    if (!comparison) return;
    for (const paneId of Object.values(comparison.paneIds)) removePane(paneId);
    setComparison(null);
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
      name: "compare",
      title: "Compare assistants side by side",
      icon: Columns3,
      argument: "<prompt>",
      run: (prompt) => setCompareDraft(prompt),
    },
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
    // Commands that open an extra are listed only while that extra is on.
    ...(extras.bots
      ? [
          {
            name: "bots",
            title: "Bots for Telegram, Discord, Slack, WhatsApp, Signal, and Home Assistant",
            icon: Bot,
            run: () => setBotsOpen(true),
          },
        ]
      : []),
    ...(extras.schedule
      ? [
          {
            name: "schedule",
            title: "Scheduled tasks",
            icon: CalendarClock,
            run: () => setScheduleOpen(true),
          },
        ]
      : []),
    {
      name: "settings",
      title: "Settings: general, assistants, agent behaviour, safety",
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
      // Skills, then commands, so each heading in the composer menu appears once.
      .sort((a, b) => Number(a.kind !== "skill") - Number(b.kind !== "skill"))
      .map((item): Command => ({
        name: item.name,
        title: item.description,
        group: item.kind === "skill" ? "Skills" : "Commands",
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

  // A reply keeps running when its tab is left, so each session's dot follows its own replies.
  const sessionStatus = (id: string): SessionStatus =>
    permissions.some((request) => runningSessions.get(request.paneId) === id)
      ? "waiting"
      : [...runningSessions.values()].includes(id)
        ? "running"
        : "idle";
  const sessionTabs = (
    <SessionTabs
      tabs={openTabs}
      activeId={sessionId}
      activeName={session.name}
      statusOf={sessionStatus}
      onSelect={focusTab}
      onClose={closeSessionTab}
      onCreate={() => void createSession()}
      onRename={(name) => setSession((current) => ({ ...current, name }))}
      onRenameEnd={() => {
        if (session.name.trim() === "") {
          setSession((current) => ({ ...current, name: UNTITLED_SESSION }));
        }
      }}
    />
  );
  const sessionActions = (
    <>
      <MemoryPopover
        memoryText={session.memoryText}
        enabledPaneCount={memoryPaneCount}
        paneCount={session.panes.length}
        onChange={setMemoryText}
      />
      <span aria-hidden className="mx-2 h-4 w-px bg-border" />
    </>
  );

  const paneTurn = pane ? agentTurns[pane.id] : undefined;
  const activeComparison = comparison?.sessionId === session.id ? comparison : null;
  const comparisonPaneIds = new Set(Object.values(activeComparison?.paneIds ?? {}));
  const reopenable = activeComparison
    ? null
    : (unfinished
        .map((item) => reopenComparison(item, session.id, session.panes))
        .find((item) => item !== null) ?? null);
  const workspaceView = activeComparison ? (
    <CompareView
      comparison={activeComparison}
      panes={session.panes}
      streamingPaneIds={streamingPaneIds}
      agentTurns={agentTurns}
      permissions={permissions}
      onRespondPermission={respondPermission}
      onKeep={keepRun}
      onDiscard={discardComparison}
      onClose={closeComparison}
    />
  ) : (
    <>
      <div className="min-h-0 flex-1 bg-background">
        {pane ? (
          <Pane
            pane={pane}
            controlsSlot={composerControls}
            showProjectBoard={extras.projectBoard}
            onSuggest={(prompt) => {
              setComposerPrompt(prompt);
              document.getElementById(COMPOSER_INPUT_ID)?.focus();
            }}
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
            onRespondPermission={(permissionId, optionId) => {
              const request = permissions.find((item) => item.permissionId === permissionId);
              if (request && optionId !== null && optionId.startsWith("deny")) {
                rememberDenial(request);
              }
              respondPermission(permissionId, optionId);
            }}
            deniedRules={deniedRules}
            onAlwaysDeny={(request, rule) => void alwaysDeny(request, rule)}
            onChange={(patch) => updatePane(pane.id, patch)}
            onRemove={() => removePane(pane.id)}
            onFixGates={(prompt) => sendToCurrent(prompt)}
            onRetry={() => retryPane(pane.id)}
            onUndo={() => undoPane(pane.id)}
            onRestore={(messageId) =>
              void restoreTo(pane.id, messageId).then((prompt) => {
                if (prompt !== undefined) setComposerPrompt(prompt);
              })
            }
            onBranch={branchToSession}
            onSaveSkill={saveAsSkill}
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

      {pane && paneTurn && streamingPaneIds.has(pane.id) && paneTurn.todos.length > 0 && (
        <TodoStrip todos={paneTurn.todos} />
      )}

      {pane &&
        paneTurn &&
        !streamingPaneIds.has(pane.id) &&
        !paneTurn.rolledBack &&
        !keptTurnIds.has(paneTurn.turnId) && (
          <ReviewBar
            key={paneTurn.turnId}
            turn={paneTurn}
            projectPath={pane.projectPath}
            onRollback={() => rollbackTurn(pane.id)}
            onRollbackFile={(path) => rollbackFile(pane.id, path)}
            onKeep={() => setKeptTurnIds((kept) => new Set(kept).add(paneTurn.turnId))}
            onShowDiff={() => {
              if (pane.projectPath) setDockProject(pane.projectPath);
              setDockShowTab({ tab: "Git", at: Date.now() });
              setDockOpen(true);
            }}
          />
        )}

      {reopenable && (
        <div
          role="region"
          aria-label="Unfinished comparison"
          className="mx-auto mb-1 flex w-[calc(100%-2rem)] max-w-[calc(48rem-2rem)] items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-2 text-xs"
        >
          <Columns3 className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-muted-foreground">
            A comparison of {reopenable.runs.length} assistants is waiting for you to keep one
            result or discard them all.
          </span>
          <Button size="xs" onClick={() => setComparison(reopenable)}>
            Reopen
          </Button>
        </div>
      )}

      <Composer
        onControlsSlot={setComposerControls}
        panes={session.panes.slice(0, 1)}
        readyProviders={readyProviders}
        commands={commands}
        prompt={composerPrompt}
        streaming={streamingPaneIds.size > 0}
        onPromptChange={setComposerPrompt}
        onSend={(prompt, images) => sendToCurrent(prompt, prompt, images)}
        onStop={abortAll}
        queued={queuedPrompt}
        onCancelQueue={cancelQueue}
        status={runStatus}
        permissionsVersion={guardVersion}
        extras={extras}
        onCompare={() => setCompareDraft(composerPrompt.startsWith("/") ? "" : composerPrompt)}
      />
    </>
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
              className="max-w-[20rem] cursor-pointer truncate border border-transparent bg-transparent font-serif text-lg font-semibold hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-screen grid-cols-[224px_minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
        <TopBar
          crumbs={
            activity === "workspace"
              ? ["Workspace", session.name || UNTITLED_SESSION]
              : activity === "files"
                ? ["Files", folderLabel(dockProjectPath ?? "")]
                : activity === "browser"
                  ? ["Browser", ...(browserTitle ? [browserTitle] : [])]
                  : ["Goals"]
          }
          streaming={streamingPaneIds.size > 0}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((open) => !open)}
          pendingCount={pendingCount}
          tabs={activity === "workspace" ? sessionTabs : undefined}
          actions={activity === "workspace" ? sessionActions : undefined}
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
          statusOf={sessionStatus}
          onSelectSession={(id) => void selectSession(id)}
          onCreateSession={() => {
            void createSession();
            setActivity("workspace");
          }}
          onDeleteSession={deleteSession}
          onOpenHistory={() => setHistory({ tab: "search", query: "" })}
          onOpenSchedule={() => setScheduleOpen(true)}
          onOpenBots={() => setBotsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          extras={extras}
        />

        <main className="workbench-grid flex min-h-0 min-w-0 flex-col">
          {activity === "workspace" ? (
            workspaceView
          ) : activity === "files" ? (
            filesView
          ) : activity === "browser" ? (
            <BrowserView onTitleChange={setBrowserTitle} />
          ) : (
            <>
              <PageHeader
                eyebrow="Kept between sessions"
                title="Goals"
                description="What you are working towards. Agents read these with your profile."
              />
              <GoalsView />
            </>
          )}
        </main>

        <BottomDock
          open={dockOpen}
          onOpenChange={setDockOpen}
          showTab={dockShowTab}
          projects={projectPaths}
          projectPath={dockProjectPath}
          onProjectChange={setDockProject}
          refreshKey={streamingPaneIds.size}
          panes={session.panes.filter(
            (item, index) => index === 0 || comparisonPaneIds.has(item.id),
          )}
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
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          tab={settingsTab}
          onTabChange={setSettingsTab}
          section={agentSection}
          onSectionChange={setAgentSection}
          extras={extras}
          onToggleExtra={setExtra}
          onOpenBots={() => setBotsOpen(true)}
          onOpenSchedule={() => setScheduleOpen(true)}
          onOpenInsights={() => setHistory({ tab: "insights", query: "" })}
          onProvidersChanged={() => setCredentialsVersion((value) => value + 1)}
          connections={connections}
          refreshingConnections={refreshingConnections}
          onRefreshConnections={() => void refreshConnections()}
          persona={persona}
          onSavePersona={savePersona}
          personalityId={session.personalityId}
          onPersonalityChange={setPersonality}
          onPermissionsChanged={() => setGuardVersion((value) => value + 1)}
          library={library}
          skillDraft={skillDraft}
          onLibraryChanged={() => {
            setSkillDraft(null);
            refreshLibrary();
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
        <CompareDialog
          prompt={compareDraft}
          projectPath={pane?.projectPath ?? null}
          connections={connections}
          onClose={() => setCompareDraft(null)}
          onStart={startComparison}
        />
        <CliOutputDialog output={cliOutput} onClose={() => setCliOutput(null)} />
        <ContextDialog paneId={contextPaneId} onClose={() => setContextPaneId(null)} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      </div>
    </TooltipProvider>
  );
}
