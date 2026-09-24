import {
  Bell,
  Bot,
  CalendarClock,
  FolderTree,
  Globe,
  History,
  Maximize2,
  MessagesSquare,
  Minimize2,
  PanelBottom,
  Plus,
  Settings,
  SquareTerminal,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { contextLimit, contextUsed } from "../shared/context";
import { PERSONALITIES } from "../shared/personalities";
import type {
  ConnectionStatus,
  PaneState,
  PermissionRequest,
  PersonaFile,
  SessionSummary,
} from "../shared/types";
import { Button } from "./components/ui/button";
import type { ExtraId } from "./extras";
import { formatTokens } from "./lib/format";
import { cn } from "./lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { PermissionCard } from "./Pane";
import { DEFAULT_CLI_MODEL_ID, providerMeta } from "./providers";
import type { AgentTurn } from "./useHarness";
import { TerminalView } from "./TerminalView";
import { ChangesTab, TestsTab } from "./WorkspaceTabs";

const DELETE_CONFIRM_WINDOW_MS = 3000;

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export type ActivityId = "workspace" | "files" | "browser" | "goals";

export function TopBar(props: {
  // Where the user is, such as ["Files", "zenith"].
  crumbs: string[];
  streaming: boolean;
  dockOpen: boolean;
  onToggleDock(): void;
  pendingCount: number;
  inspector: ReactNode;
  // Replaces the last crumb, such as an editable session name.
  title?: ReactNode;
  // Page controls shown before the global ones.
  actions?: ReactNode;
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  return (
    <header
      aria-label="Zenith top bar"
      className="window-drag top-bar col-span-full grid h-[52px] grid-cols-[224px_minmax(0,1fr)_auto] items-center border-b border-border bg-card"
    >
      <div className="brand-cell flex h-full min-w-0 items-center gap-2.5 border-r border-border px-[18px]">
        <span
          aria-hidden
          className="grid size-[22px] shrink-0 place-items-center rounded-md bg-primary font-serif text-[12px] font-bold text-primary-foreground"
        >
          Z
        </span>
        <span className="text-[13px] font-semibold">Zenith</span>
      </div>
      <nav
        aria-label="Location"
        className="flex min-w-0 items-center gap-2 px-[18px] text-[11.5px] text-muted-foreground"
      >
        {props.crumbs.map((crumb, index) => (
          <span key={`${index}-${crumb}`} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span aria-hidden>/</span>}
            {index === props.crumbs.length - 1 && props.title ? (
              props.title
            ) : (
              <span
                className={cn("truncate", index === props.crumbs.length - 1 && "text-foreground")}
              >
                {crumb}
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-1 pr-3">
        {props.actions}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={props.dockOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={props.dockOpen ? "Hide bottom panel" : "Show bottom panel"}
              aria-pressed={props.dockOpen}
              onClick={props.onToggleDock}
            >
              <PanelBottom />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Terminal, tests, Git, files, logs, and approvals</TooltipContent>
        </Tooltip>
        <Popover open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={inspectorOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={
                props.pendingCount > 0
                  ? `Run inspector, ${props.pendingCount} waiting for approval`
                  : "Run inspector"
              }
              className="relative"
            >
              <Bell />
              {(props.pendingCount > 0 || props.streaming) && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1 top-1 grid min-w-3.5 place-items-center px-0.5 font-mono text-[9px] leading-3.5",
                    props.pendingCount > 0
                      ? "bg-primary text-primary-foreground"
                      : "size-1.5 min-w-0 rounded-full bg-success p-0",
                  )}
                >
                  {props.pendingCount > 0 ? props.pendingCount : ""}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-0">{props.inspector}</PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

export function ActivityRail(props: {
  active: ActivityId;
  onSelect(id: ActivityId): void;
  activeSessionId: string;
  activeSessionName: string;
  // Live state of the open session; other sessions are not running.
  activeStatus: "running" | "waiting" | "idle";
  onSelectSession(id: string): void;
  onCreateSession(): void;
  onDeleteSession(id: string): Promise<void>;
  onOpenHistory(): void;
  onOpenSchedule(): void;
  onOpenBots(): void;
  onOpenSettings(): void;
  extras: Record<ExtraId, boolean>;
}) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = () => {
    window.zenith.sessions
      .list()
      .then(setSummaries)
      .catch((error: unknown) => console.error("Failed to list sessions:", error));
  };

  useEffect(refresh, [props.activeSessionId]);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  function requestDelete(id: string) {
    clearTimeout(confirmTimer.current);
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      void props.onDeleteSession(id).then(refresh);
      return;
    }
    setConfirmDeleteId(id);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_WINDOW_MS);
  }

  // A just-created session may not be saved yet when the list is fetched.
  const rows = summaries.some((summary) => summary.id === props.activeSessionId)
    ? summaries
    : [{ id: props.activeSessionId, name: props.activeSessionName, updatedAt: 0 }, ...summaries];

  const railButton = (active: boolean) =>
    cn(
      "relative flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-[color,background-color,scale] active:scale-[0.98] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-accent font-medium text-foreground"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <nav
      aria-label="Primary activity"
      className="sidebar row-span-2 flex min-h-0 flex-col overflow-y-auto border-r border-border bg-card"
    >
      <div className="flex flex-col gap-0.5 px-2.5 pt-4">
        <button
          type="button"
          aria-current={props.active === "workspace" ? "page" : undefined}
          onClick={() => props.onSelect("workspace")}
          className={railButton(props.active === "workspace")}
        >
          <SquareTerminal className="size-4" aria-hidden />
          Workspace
        </button>
        <button
          type="button"
          aria-current={props.active === "files" ? "page" : undefined}
          onClick={() => props.onSelect("files")}
          className={railButton(props.active === "files")}
        >
          <FolderTree className="size-4" aria-hidden />
          Files
        </button>
        <button
          type="button"
          aria-current={props.active === "browser" ? "page" : undefined}
          onClick={() => props.onSelect("browser")}
          className={railButton(props.active === "browser")}
        >
          <Globe className="size-4" aria-hidden />
          Browser
        </button>
        {props.extras.goals && (
          <button
            type="button"
            aria-current={props.active === "goals" ? "page" : undefined}
            onClick={() => props.onSelect("goals")}
            className={railButton(props.active === "goals")}
          >
            <Target className="size-4" aria-hidden />
            Goals
          </button>
        )}
        <button type="button" onClick={props.onCreateSession} className={railButton(false)}>
          <Plus className="size-4" aria-hidden />
          New session
        </button>
      </div>

      <p className="eyebrow mx-[18px] mb-1.5 mt-5 text-muted-foreground">Sessions</p>
      <ul aria-label="Sessions" className="min-h-[124px] flex-1 overflow-y-auto px-2.5">
        {rows.map((summary) => {
          const isActive = summary.id === props.activeSessionId;
          const isConfirming = confirmDeleteId === summary.id;
          const name = (isActive ? props.activeSessionName : summary.name) || "Untitled session";
          const status = isActive ? props.activeStatus : "idle";
          return (
            <li key={summary.id} className="group relative">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  props.onSelectSession(summary.id);
                  props.onSelect("workspace");
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-left text-[12.5px] transition-[color,background-color,scale] active:scale-[0.98] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className="relative grid size-3.5 shrink-0 place-items-center">
                  {status === "idle" ? (
                    <MessagesSquare
                      className={cn("size-3.5", isActive ? "text-primary" : "opacity-60")}
                      aria-hidden
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        status === "running"
                          ? "bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.15)] motion-safe:animate-pulse"
                          : "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]",
                      )}
                    />
                  )}
                </span>
                {/* Only the topic shows; the dot beside it says when the session needs you. */}
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {status !== "idle" && (
                  <span className="sr-only">
                    {status === "running" ? "Working" : "Needs your answer"}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={isConfirming ? `Confirm delete ${name}` : `Delete ${name}`}
                onClick={() => requestDelete(summary.id)}
                className={cn(
                  "absolute right-1 top-1/2 flex h-6 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
                  isConfirming
                    ? "bg-destructive/20 px-1.5 text-[10px] text-danger opacity-100"
                    : "w-6",
                )}
              >
                {isConfirming ? "Delete?" : <Trash2 className="size-3" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-0.5 border-t border-border px-2.5 py-2">
        <button type="button" className={railButton(false)} onClick={props.onOpenHistory}>
          <History className="size-4" aria-hidden />
          <span className="flex-1">History</span>
          <kbd className="font-mono text-[10px]">
            {navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl"} K
          </kbd>
        </button>
        {props.extras.schedule && (
          <button type="button" className={railButton(false)} onClick={props.onOpenSchedule}>
            <CalendarClock className="size-4" aria-hidden />
            Scheduled tasks
          </button>
        )}
        {props.extras.bots && (
          <button type="button" className={railButton(false)} onClick={props.onOpenBots}>
            <Bot className="size-4" aria-hidden />
            Bots
          </button>
        )}
        <button type="button" className={railButton(false)} onClick={props.onOpenSettings}>
          <Settings className="size-4" aria-hidden />
          <span className="flex-1">Settings</span>
          <kbd className="font-mono text-[10px]">
            {navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl"} ,
          </kbd>
        </button>
      </div>
    </nav>
  );
}

export function PageHeader(props: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  // One slim row, for the workspace where the conversation needs the height.
  compact?: boolean;
}) {
  if (props.compact) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-5">
        <p className="eyebrow shrink-0 text-muted-foreground">{props.eyebrow}</p>
        <div className="min-w-0 flex-1 font-serif text-base font-semibold leading-tight tracking-tight text-foreground">
          {props.title}
        </div>
        {props.description && (
          <p className="hidden max-w-[45%] shrink truncate font-mono text-[11px] text-muted-foreground md:block">
            {props.description}
          </p>
        )}
        {props.actions}
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="eyebrow text-muted-foreground">{props.eyebrow}</p>
        <div className="min-w-0 font-serif text-xl font-semibold leading-tight tracking-tight text-foreground">
          {props.title}
        </div>
        {props.description && <p className="text-xs text-muted-foreground">{props.description}</p>}
      </div>
      {props.actions && <div className="flex flex-wrap items-center gap-1.5">{props.actions}</div>}
    </div>
  );
}

function InspectorRow(props: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-xs">
      <dt className="shrink-0 text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 truncate text-right text-foreground/85">{props.value}</dd>
    </div>
  );
}

export function RunInspector(props: {
  pane: PaneState | undefined;
  agentTurn: AgentTurn | undefined;
  agentName: string | null;
  streaming: boolean;
  pendingCount: number;
  persona: Record<PersonaFile, string>;
  personalityId: string;
  skillCount: number;
  commandCount: number;
  connections: ConnectionStatus[];
  onOpenSettings(): void;
  onShowContext(): void;
}) {
  const { pane } = props;
  const state = props.pendingCount > 0 ? "AWAITING APPROVAL" : props.streaming ? "RUNNING" : "IDLE";
  const soulLine = props.persona["SOUL.md"]
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const role = PERSONALITIES.find((item) => item.id === props.personalityId);
  const limit = pane ? contextLimit(pane) : undefined;
  const ready = props.connections.filter((connection) => connection.state === "ready");
  const todos = props.agentTurn?.todos ?? [];

  return (
    <aside
      aria-label="Run inspector"
      className="flex max-h-[min(720px,calc(100vh-72px))] flex-col overflow-y-auto bg-card"
    >
      <div className="flex min-h-[63px] items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Run inspector</p>
          <p className="text-[13px] text-foreground">Current state</p>
        </div>
        <span
          className={cn(
            "border px-1.5 py-1 text-[11.5px] rounded-md",
            state === "IDLE" ? "border-success/35 text-success" : "border-primary/40 text-primary",
          )}
        >
          {state}
        </span>
      </div>

      <div className="mx-4 mt-3">
        <button
          type="button"
          onClick={props.onShowContext}
          disabled={!pane}
          className="w-full cursor-pointer border border-border px-3 py-1.5 text-left text-[11.5px] text-primary transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          WHAT THE MODEL SAW →
        </button>
      </div>

      <section className="m-4 flex items-center gap-3 border border-primary/20 bg-popover p-3.5 rounded-md">
        <div
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 font-serif font-bold text-primary"
        >
          Z
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold">{pane?.name ?? "Master orchestrator"}</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {pane
              ? `${providerMeta(pane.providerId).label}${pane.modelId && pane.modelId !== DEFAULT_CLI_MODEL_ID ? ` · ${pane.modelId}` : ""}`
              : "Zenith · local policy owner"}
          </p>
        </div>
      </section>

      <dl className="mx-4">
        <InspectorRow label="Soul" value={soulLine ?? "Default"} />
        <InspectorRow label="Role" value={role?.id ? role.label : "None"} />
        <InspectorRow label="Agent" value={props.agentName ?? "None"} />
        <InspectorRow
          label="Skills"
          value={`${props.skillCount} ${props.skillCount === 1 ? "skill" : "skills"} · ${props.commandCount} ${props.commandCount === 1 ? "command" : "commands"}`}
        />
        <InspectorRow
          label="Project"
          value={
            pane?.projectPath ? (
              <span title={pane.projectPath}>{folderName(pane.projectPath)}</span>
            ) : (
              "Chat only"
            )
          }
        />
        <InspectorRow
          label="Mode"
          value={pane?.projectPath ? (pane.planMode ? "Plan (read-only)" : "Build") : "Chat"}
        />
        <InspectorRow
          label="Context"
          value={
            pane
              ? `${formatTokens(contextUsed(pane))}${limit ? ` / ${formatTokens(limit)}` : ""}`
              : "—"
          }
        />
      </dl>

      {todos.length > 0 && (
        <section className="mx-4 mt-4 border border-border rounded-md">
          <p className="eyebrow border-b border-border px-3 py-2 text-muted-foreground">
            Task path
          </p>
          <ol>
            {todos.map((todo, index) => (
              <li
                key={`${index}-${todo.content}`}
                className={cn(
                  "grid grid-cols-[22px_1fr_auto] items-baseline gap-1 border-b border-border px-3 py-2 text-[11px] last:border-b-0",
                  todo.status === "in_progress" && "bg-primary/[0.06]",
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    todo.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {todo.content}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    todo.status === "in_progress" ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {todo.status === "in_progress"
                    ? "Active"
                    : todo.status === "completed"
                      ? "Done"
                      : "Next"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mx-4 mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Credential vault</p>
          <button
            type="button"
            onClick={props.onOpenSettings}
            className="cursor-pointer text-[11.5px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            MANAGE
          </button>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {ready.length === 0 ? (
            <li className="text-[11px] text-muted-foreground">No connections ready.</li>
          ) : (
            ready.map((connection) => (
              <li
                key={connection.id}
                className="flex items-center gap-1.5 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground rounded-md"
              >
                <span
                  className={cn("size-1.5 rounded-full", providerMeta(connection.id).dotClass)}
                />
                {connection.label}
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="mx-4 mb-4 mt-4 border-t border-border pt-3">
        <p className="eyebrow text-muted-foreground">Local policy</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Edits, commands, and MCP tools ask first unless Settings → Safety allows them. Undo
          restores the project folder.
        </p>
      </div>
    </aside>
  );
}

const DOCK_TABS = ["Terminal", "Tests", "Git", "Logs", "Approvals"] as const;
export type DockTab = (typeof DOCK_TABS)[number];

function NoProject() {
  return (
    <p className="p-4 text-xs text-muted-foreground">
      Choose a project folder for this session (the folder button in the conversation header) to use
      the terminal, tests, and Git here.
    </p>
  );
}

export function BottomDock(props: {
  projects: string[];
  projectPath: string | null;
  onProjectChange(path: string): void;
  refreshKey: number;
  panes: PaneState[];
  agentTurns: Record<string, AgentTurn>;
  permissions: PermissionRequest[];
  onRespondPermission(permissionId: string, optionId: string | null): void;
  onOpenWorktree(path: string): void;
  // Shown and hidden from the top bar; kept mounted while hidden so terminal output survives.
  open: boolean;
  onOpenChange(open: boolean): void;
  // Asks the dock to switch tab; `at` makes a repeat request for the same tab count.
  showTab?: { tab: DockTab; at: number } | undefined;
}) {
  const [tab, setTab] = useState<DockTab>("Terminal");
  const [seenShowTab, setSeenShowTab] = useState(props.showTab);
  if (props.showTab !== seenShowTab) {
    setSeenShowTab(props.showTab);
    if (props.showTab) setTab(props.showTab.tab);
  }
  const { open } = props;
  const setOpen = props.onOpenChange;
  const [tall, setTall] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const paneName = (paneId: string) =>
    props.panes.find((pane) => pane.id === paneId)?.name ?? "Pane";

  const logs = props.panes.flatMap((pane) => [
    ...(props.agentTurns[pane.id]?.activities ?? []).map((activity) => ({
      key: `${pane.id}:${activity.id}`,
      pane: pane.name,
      title: activity.title,
      status: activity.status,
      detail: activity.detail ?? "",
    })),
    ...(pane.lastError
      ? [
          {
            key: `${pane.id}:error`,
            pane: pane.name,
            title: "Reply failed",
            status: "failed",
            detail: pane.lastError,
          },
        ]
      : []),
  ]);
  const current = props.permissions[0];

  // New approvals bring the dock forward, so an agent waiting for one is noticed.
  const pending = props.permissions.length;
  const [seenPending, setSeenPending] = useState(pending);
  if (pending !== seenPending) {
    setSeenPending(pending);
    if (pending > seenPending) {
      setOpen(true);
      setTab("Approvals");
    }
  }

  function select(next: DockTab) {
    setTab(next);
    setOpen(true);
  }

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = DOCK_TABS.length;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : undefined;
    const label = next === undefined ? undefined : DOCK_TABS[next];
    if (next === undefined || !label) return;
    event.preventDefault();
    select(label);
    tabs.current[next]?.focus();
  }

  const project = props.projectPath;
  return (
    <section
      aria-label="Bottom panel"
      hidden={!open}
      className={cn(
        "col-start-2 grid min-h-0 grid-rows-[38px_minmax(0,1fr)] border-t border-border bg-card",
        tall ? "h-[72vh]" : "h-[clamp(200px,30vh,300px)]",
      )}
    >
      <div className="flex items-center gap-1 border-b border-border px-3">
        <div
          role="tablist"
          aria-label="Bottom panel views"
          className="flex h-full items-stretch gap-1"
        >
          {DOCK_TABS.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              ref={(node) => {
                tabs.current[index] = node;
              }}
              aria-selected={tab === label}
              aria-controls="bottom-panel-content"
              tabIndex={tab === label ? 0 : -1}
              onClick={() => select(label)}
              onKeyDown={(event) => move(event, index)}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === label
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {label === "Approvals" && pending > 0 && (
                <span className="bg-primary px-1 text-[10px] text-primary-foreground">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {open && props.projects.length > 0 && project && (
            <Select value={project} onValueChange={props.onProjectChange}>
              <SelectTrigger
                aria-label="Project folder"
                className="h-7 w-auto max-w-56 font-mono text-[11px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.projects.map((path) => (
                  <SelectItem key={path} value={path}>
                    <span title={path}>{folderName(path)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={tall ? "Shrink bottom panel" : "Expand bottom panel"}
            aria-pressed={tall}
            onClick={() => setTall((value) => !value)}
          >
            {tall ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Hide bottom panel"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
      </div>

      {/* The approval drawer only takes space while something is waiting, so the terminal,
          tests, and Git get the full width the rest of the time. */}
      <div
        className={cn(
          "grid min-h-0",
          pending > 0 ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1",
        )}
      >
        <div
          id="bottom-panel-content"
          role="tabpanel"
          aria-label={`${tab} panel`}
          className="flex min-h-0 flex-col"
        >
          {/* Keyed by project so switching folders starts each view fresh; the terminals stay
              mounted so their output survives tab switches. */}
          {project ? (
            <div
              key={project}
              className={cn(
                "min-h-0 flex-1 flex-col",
                tab === "Logs" || tab === "Approvals" ? "hidden" : "flex",
              )}
            >
              <div
                className={cn("min-h-0 flex-1 flex-col", tab === "Terminal" ? "flex" : "hidden")}
              >
                <TerminalView projectPath={project} />
              </div>
              <div className={cn("min-h-0 flex-1 flex-col", tab === "Tests" ? "flex" : "hidden")}>
                <TestsTab projectPath={project} />
              </div>
              {tab === "Git" && (
                <ChangesTab
                  projectPath={project}
                  refreshKey={props.refreshKey}
                  onOpenWorktree={props.onOpenWorktree}
                />
              )}
            </div>
          ) : (
            (tab === "Terminal" || tab === "Tests" || tab === "Git") && <NoProject />
          )}
          {tab === "Logs" && (
            <ol
              aria-label="Agent activity"
              className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px]"
            >
              {logs.length === 0 ? (
                <li className="p-4 text-muted-foreground">
                  Agent actions from the latest reply in each pane appear here.
                </li>
              ) : (
                logs.map((entry) => (
                  <li
                    key={entry.key}
                    className="grid grid-cols-[120px_minmax(0,1fr)_110px] gap-3 border-b border-border px-4 py-1.5"
                  >
                    <span className="truncate text-muted-foreground">{entry.pane}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-foreground/90">{entry.title}</span>
                      {entry.detail && (
                        <span className="block truncate text-muted-foreground">{entry.detail}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-right uppercase",
                        entry.status === "done"
                          ? "text-success"
                          : entry.status === "failed" || entry.status === "denied"
                            ? "text-danger"
                            : "text-primary",
                      )}
                    >
                      {entry.status}
                    </span>
                  </li>
                ))
              )}
            </ol>
          )}
          {tab === "Approvals" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {props.permissions.length === 0 ? (
                <p className="p-1 text-xs text-muted-foreground">
                  No actions are waiting for approval.
                </p>
              ) : (
                props.permissions.map((request) => (
                  <div key={request.permissionId} className="flex flex-col gap-1">
                    <p className="eyebrow text-muted-foreground">{paneName(request.paneId)}</p>
                    <PermissionCard
                      request={request}
                      onRespond={(optionId) =>
                        props.onRespondPermission(request.permissionId, optionId)
                      }
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {pending > 0 && (
          <section
            aria-label="Approval drawer"
            className="flex min-h-0 flex-col gap-2 overflow-y-auto border-l border-border bg-background/60 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="eyebrow text-muted-foreground">Approval queue</p>
                <p className="font-mono text-[13px]">{pending} pending</p>
              </div>
              <span className="border border-border px-1.5 py-1 text-[11.5px] text-muted-foreground rounded-md">
                POLICY ENFORCED
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Consequential actions wait for your approval in the pane or here.
            </p>
            <div className="flex flex-col gap-0.5">
              <span className="eyebrow text-muted-foreground">Current exact action</span>
              <code className="break-words font-mono text-[11px] text-primary">
                {current
                  ? `${paneName(current.paneId)}: ${current.detail ?? current.title}`
                  : "No action awaiting decision"}
              </code>
            </div>
            <span className="mt-auto font-mono text-[10px] text-muted-foreground">
              Session activity · {logs.length} events
            </span>
          </section>
        )}
      </div>
    </section>
  );
}

export function RolePage(props: { personalityId: string; onChange(id: string): void }) {
  return (
    <ul className="grid gap-2 p-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {PERSONALITIES.map((personality) => {
        const active = personality.id === props.personalityId;
        return (
          <li key={personality.id || "none"}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => props.onChange(personality.id)}
              className={cn(
                "flex h-full w-full cursor-pointer flex-col gap-1.5 border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
                active ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:border-input",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{personality.label}</span>
                {active && <span className="text-[11.5px] text-primary">ACTIVE</span>}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {personality.prompt || "Models answer with only the soul, profile, and memory."}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
