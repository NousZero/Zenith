import {
  AlertCircle,
  ArrowDown,
  Ban,
  ArrowUp,
  Bot,
  Brain,
  ClipboardList,
  Copy,
  Download,
  Eraser,
  FileDown,
  FolderOpen,
  FolderTree,
  KanbanSquare,
  GitBranch,
  History,
  KeyRound,
  MessageSquare,
  MessageSquareReply,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ScanEye,
  Server,
  ShieldAlert,
  Shrink,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { denyRuleFor } from "../shared/deny-rule";
import type { ConnectionStatus, Model, PaneState, PermissionRequest } from "../shared/types";
import type { AgentTurn } from "./useHarness";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Switch } from "./components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { AgentPanel, DiffView } from "./AgentPanel";
import { AttachmentImage } from "./AttachmentImage";
import { EmptyState } from "./EmptyState";
import {
  COMPACT_KEEP_MESSAGES,
  COMPACT_THRESHOLD,
  contextLimit,
  contextUsed,
} from "../shared/context";
import { formatTokens } from "./lib/format";
import { cn } from "./lib/utils";
import { Markdown } from "./Markdown";
import { DEFAULT_CLI_MODEL_ID, PROVIDERS, providerMeta, usesDefaultModel } from "./providers";

const STICK_TO_BOTTOM_PX = 48;
// Radix Select needs a value that is not a real model id.
const CUSTOM_MODEL = "__custom__";

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

// API providers come from the connection list: the ones the user added, plus built-in ones with
// a saved key. The pane's current provider stays listed so its selection still shows.
function providerGroups(connections: ConnectionStatus[], currentId: string) {
  const apiIds = new Set(
    connections.filter((connection) => connection.kind === "api-key").map((c) => c.id),
  );
  if (providerMeta(currentId).kind === "api-key") apiIds.add(currentId);
  return [
    {
      label: "On this computer",
      providers: PROVIDERS.filter((p) => p.kind === "cli" || p.kind === "local"),
    },
    {
      label: "Agents",
      providers: [
        ...PROVIDERS.filter((p) => p.kind === "agent"),
        // Other ACP agents installed on this computer.
        ...connections
          .filter(
            (connection) =>
              connection.kind === "agent" && !PROVIDERS.some((p) => p.id === connection.id),
          )
          .map((connection) => providerMeta(connection.id)),
      ],
    },
    { label: "API providers", providers: [...apiIds].map((id) => providerMeta(id)) },
  ].filter((group) => group.providers.length > 0);
}

export function PermissionCard(props: {
  request: PermissionRequest;
  onRespond(optionId: string | null): void;
  // Offered once the same thing has been denied before: deny it and write the rule.
  onAlwaysDeny?(rule: string): void;
}) {
  const { request } = props;
  const rule = props.onAlwaysDeny ? denyRuleFor(request) : undefined;
  return (
    <div
      role="alertdialog"
      aria-label="Agent approval"
      className="flex flex-col gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[13px] font-medium text-foreground">Approve this action?</p>
          <p className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
            {request.title}
          </p>
          {request.detail && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/80 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
              {request.detail}
            </pre>
          )}
          {request.diff && <DiffView diff={request.diff} />}
          {request.warning && <p className="text-xs text-warning">{request.warning}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-6.5">
        {request.options.map((option) => (
          <Button
            key={option.id}
            size="xs"
            variant={
              option.kind === "allow_once"
                ? "default"
                : option.kind.startsWith("reject")
                  ? "destructive"
                  : "outline"
            }
            onClick={() => props.onRespond(option.id)}
          >
            {option.label}
          </Button>
        ))}
        {request.options.length === 0 && (
          <Button size="xs" variant="outline" onClick={() => props.onRespond(null)}>
            Dismiss
          </Button>
        )}
        {rule && (
          <Button
            size="xs"
            variant="outline"
            title={`Adds "${rule}" to your rules in Settings → Guardrails.`}
            onClick={() => props.onAlwaysDeny?.(rule)}
          >
            <Ban />
            Deny and never ask again
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageActions(props: {
  content: string;
  isLast: boolean;
  onBranch?(): void;
  branchLabel?: string;
  onRetry(): void;
  onUndo(): void;
  onRemember(): void;
  onSaveSkill?(): void;
}) {
  const actions = [
    { label: "Copy", icon: Copy, run: () => void navigator.clipboard.writeText(props.content) },
    { label: "Remember…", icon: Brain, run: props.onRemember },
    ...(props.onSaveSkill
      ? [{ label: "Save as skill…", icon: Sparkles, run: props.onSaveSkill }]
      : []),
    ...(props.onBranch
      ? [
          {
            label: props.branchLabel ?? "Branch into new pane",
            icon: GitBranch,
            run: props.onBranch,
          },
        ]
      : []),
    ...(props.isLast
      ? [
          { label: "Retry", icon: RotateCcw, run: props.onRetry },
          { label: "Undo exchange", icon: Undo2, run: props.onUndo },
        ]
      : []),
  ];
  return (
    <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      {actions.map((action) => (
        <Tooltip key={action.label}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={action.label}
              onClick={action.run}
              className="text-muted-foreground"
            >
              <action.icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// Two clicks, as restoring throws away later replies and file changes.
function RestoreButton(props: { onRestore(): void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Button
      variant={confirming ? "destructive" : "ghost"}
      size="xs"
      onClick={() => {
        if (!confirming) return setConfirming(true);
        setConfirming(false);
        props.onRestore();
      }}
      onBlur={() => setConfirming(false)}
      className={cn(
        "mt-1 shrink-0 transition-opacity",
        confirming
          ? "opacity-100"
          : "text-muted-foreground opacity-0 group-hover/prompt:opacity-100 focus-visible:opacity-100",
      )}
    >
      <History />
      {confirming ? "Undo this and everything after?" : "Restore to here"}
    </Button>
  );
}

function NotReadyState(props: {
  label: string;
  connection: ConnectionStatus | undefined;
  onOpenSettings(): void;
}) {
  const { connection, label } = props;
  const settingsButton = (text: string) => (
    <Button size="sm" onClick={props.onOpenSettings}>
      {text}
    </Button>
  );
  if (!connection || connection.kind === "api-key") {
    return (
      <EmptyState
        icon={KeyRound}
        title={`Connect ${label}`}
        description={`Add a ${label} API key to chat in this pane.`}
        action={settingsButton("Add API key")}
      />
    );
  }
  if (connection.state === "not-installed") {
    return (
      <EmptyState
        icon={Download}
        title={`${label} isn't installed`}
        description="Install it, sign in once in a terminal, then refresh connections."
        action={settingsButton("Open connections")}
      />
    );
  }
  if (connection.state === "not-running") {
    return (
      <EmptyState
        icon={Server}
        title={`${label} isn't running`}
        description={connection.detail.replace(/^Not running · /, "")}
        action={settingsButton("Open connections")}
      />
    );
  }
  return (
    <EmptyState
      icon={KeyRound}
      title={`Sign in to ${label}`}
      description={connection.detail}
      action={settingsButton("Open connections")}
    />
  );
}

export function Pane(props: {
  pane: PaneState;
  credentialsVersion: number;
  connections: ConnectionStatus[];
  streaming: boolean;
  agentTurn: AgentTurn | undefined;
  onRollback(): Promise<void>;
  // Sends the failing checks back to this pane as the next prompt.
  onFixGates?(prompt: string): void;
  onOpenBoard(projectPath: string): void;
  onOpenWorkspace(projectPath: string): void;
  // Name of the library agent this pane follows, or null.
  agentName: string | null;
  onChooseAgent(): void;
  onBuildPlan(): void;
  onRemember(text: string): void;
  onSaveSkill?(messageId: string): void;
  compacting: boolean;
  onCompact(): void;
  permissions: PermissionRequest[];
  onRespondPermission(permissionId: string, optionId: string | null): void;
  // Rules for actions already denied in this session, and what to do when one is accepted.
  deniedRules?: readonly string[];
  onAlwaysDeny?(request: PermissionRequest, rule: string): void;
  onChange(patch: Partial<PaneState>): void;
  onRemove(): void;
  // Multiple panes are on hold: one pane per session hides broadcast, branching, and removal.
  singlePane?: boolean;
  onExport?(kind: "markdown" | "html"): void;
  onShowContext?(): void;
  onSend(prompt: string): void;
  onRetry(): void;
  onUndo(): void;
  onBranch(messageId: string): void;
  // Undo everything from this prompt on, files included, and hand the prompt back to edit.
  onRestore?(messageId: string): void;
  onStop(): void;
  onOpenSettings(): void;
}) {
  const {
    pane,
    credentialsVersion,
    connections,
    streaming,
    compacting,
    onChange,
    onRemove,
    onSend,
    onRetry,
  } = props;
  const connection = connections.find((candidate) => candidate.id === pane.providerId);
  const modelsKey = `${pane.providerId}:${credentialsVersion}:${connection?.state ?? "unknown"}`;
  const [loadedModels, setLoadedModels] = useState<{ key: string; models: Model[] }>({
    key: "",
    models: [],
  });
  const modelsLoading = loadedModels.key !== modelsKey;
  const models = modelsLoading ? [] : loadedModels.models;
  const [reply, setReply] = useState("");
  // Panes reply to broadcasts by default; the per-pane reply box opens on demand.
  const [replyOpen, setReplyOpen] = useState(false);
  const [typingModel, setTypingModel] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(pane.name);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);

  const provider = providerMeta(pane.providerId);
  const isConfigured = connection?.state === "ready";
  const canSend = isConfigured && pane.modelId !== "";
  const modelLabel = models.find((model) => model.id === pane.modelId)?.label ?? pane.modelId;
  const replyTarget = pane.modelId === DEFAULT_CLI_MODEL_ID ? provider.label : modelLabel;

  // Whoever reviews the changes should not be the connection that made them; only fall back to it
  // when nothing else is ready.
  // Only connections that bring their own model can be asked without choosing one first.
  const reviewers = props.connections.filter(
    (connection) => connection.state === "ready" && usesDefaultModel(connection.kind),
  );
  const reviewerConnection =
    reviewers.find((connection) => connection.id !== pane.providerId) ?? reviewers[0];
  const reviewer = reviewerConnection
    ? {
        providerId: reviewerConnection.id,
        modelId: DEFAULT_CLI_MODEL_ID,
        label: reviewerConnection.label,
      }
    : undefined;
  const lastMessage = pane.messages.at(-1);
  const lastAssistant = [...pane.messages].reverse().find((m) => m.role === "assistant");
  const awaitingReply = streaming && lastMessage?.role === "user";
  const hasPrompt = pane.messages.some((message) => message.role === "user");

  async function chooseProject() {
    const folder = await window.zenith.projects.choose();
    if (folder) onChange({ projectPath: folder });
  }

  const contextTokens = contextUsed(pane);
  const limit = contextLimit(pane);
  const contextShare = limit ? Math.min(contextTokens / limit, 1) : undefined;
  const canCompact =
    !streaming &&
    !compacting &&
    pane.modelId !== "" &&
    pane.messages.length > COMPACT_KEEP_MESSAGES;
  const missingKeyError = pane.lastError?.startsWith("No API key") ?? false;

  useEffect(() => {
    let cancelled = false;
    window.zenith.providers
      .listModels(pane.providerId)
      .then((list) => {
        if (!cancelled) setLoadedModels({ key: modelsKey, models: list });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadedModels({ key: modelsKey, models: [] });
        console.error(`Failed to list models for ${pane.providerId}:`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [pane.providerId, modelsKey]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [pane.messages, pane.lastError, awaitingReply, props.permissions.length]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
    setScrolledUp(!stickToBottom.current);
  }

  // Reading back through a long run scrolls away from what the agent is doing now.
  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = true;
    setScrolledUp(false);
    element.scrollTop = element.scrollHeight;
  }

  function submitReply() {
    const prompt = reply.trim();
    if (!prompt || !canSend) return;
    stickToBottom.current = true;
    onSend(prompt);
    setReply("");
  }

  function commitName() {
    const name = draftName.trim();
    if (name) onChange({ name });
    setEditingName(false);
  }

  const modelPlaceholder = modelsLoading
    ? "Loading models…"
    : models.length === 0
      ? isConfigured
        ? "No models available"
        : provider.kind === "api-key"
          ? "Add a key to load models"
          : "Unavailable"
      : "Select model";

  return (
    <section aria-label={pane.name} className="@container flex h-full min-w-0 flex-col bg-card">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        {editingName ? (
          <Input
            autoFocus
            aria-label="Pane name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName();
              if (event.key === "Escape") setEditingName(false);
            }}
            className="h-8 flex-1"
          />
        ) : (
          <>
            <Select
              value={pane.providerId}
              onValueChange={(value) =>
                onChange({
                  providerId: value,
                  modelId: usesDefaultModel(providerMeta(value).kind) ? DEFAULT_CLI_MODEL_ID : "",
                  contextWindow: null,
                })
              }
            >
              <SelectTrigger
                aria-label="Provider"
                className="h-8 w-auto max-w-[140px] shrink-0 border-transparent bg-transparent px-2 font-medium hover:bg-accent @max-[460px]:[&_.option-label]:hidden"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[14rem]">
                {providerGroups(connections, pane.providerId).map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    {groupIndex > 0 && <SelectSeparator />}
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.providers.map((option) => {
                      const status = connections.find((c) => c.id === option.id);
                      const ready = status?.state === "ready";
                      return (
                        <SelectItem key={option.id} value={option.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                option.dotClass,
                                !ready && "opacity-35",
                              )}
                            />
                            <span className={cn("option-label", !ready && "text-muted-foreground")}>
                              {option.label}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <span className="select-none text-muted-foreground/50" aria-hidden>
              /
            </span>
            {typingModel ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = customModel.trim();
                  if (value) onChange({ modelId: value, contextWindow: null });
                  setTypingModel(false);
                }}
              >
                <Input
                  autoFocus
                  aria-label="Model id"
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setTypingModel(false);
                  }}
                  placeholder="claude-opus-5"
                  className="h-8 font-mono text-xs"
                />
                <Button type="submit" size="xs" disabled={customModel.trim() === ""}>
                  Use
                </Button>
              </form>
            ) : (
              <Select
                value={pane.modelId}
                onValueChange={(value) => {
                  if (value === CUSTOM_MODEL) {
                    setCustomModel(pane.modelId === DEFAULT_CLI_MODEL_ID ? "" : pane.modelId);
                    setTypingModel(true);
                    return;
                  }
                  onChange({ modelId: value, contextWindow: null });
                }}
                disabled={models.length === 0}
              >
                <SelectTrigger
                  aria-label="Model"
                  className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 text-[13px] hover:bg-accent"
                >
                  <SelectValue placeholder={modelPlaceholder}>{modelLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-[16rem]">
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id} className="text-[13px]">
                      {model.label}
                    </SelectItem>
                  ))}
                  {pane.modelId && !models.some((model) => model.id === pane.modelId) && (
                    <SelectItem value={pane.modelId} className="text-[13px]">
                      {pane.modelId}
                    </SelectItem>
                  )}
                  <SelectSeparator />
                  <SelectItem value={CUSTOM_MODEL} className="text-xs">
                    Custom model…
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </>
        )}

        {/* Every connection can work in a folder; the CLIs switch to their agent mode there. */}
        {!editingName && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                {pane.projectPath ? (
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Project folder ${pane.projectPath}`}
                      className="max-w-[120px] shrink-0 text-primary"
                    >
                      <FolderOpen />
                      <span className="truncate">{folderName(pane.projectPath)}</span>
                    </Button>
                  </DropdownMenuTrigger>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Work in a project folder"
                    className="shrink-0"
                    onClick={() => void chooseProject()}
                  >
                    <FolderOpen />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>
                {pane.projectPath
                  ? `Agent works in ${pane.projectPath}`
                  : "Work in a project folder: the agent can read, edit, and run commands there, asking you first"}
              </TooltipContent>
            </Tooltip>
            {pane.projectPath && (
              <DropdownMenuContent align="end" className="max-w-[20rem]">
                <DropdownMenuLabel className="truncate font-mono text-[11px]">
                  {pane.projectPath}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => props.onOpenWorkspace(pane.projectPath ?? "")}>
                  <FolderTree />
                  Open workspace
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onOpenBoard(pane.projectPath ?? "")}>
                  <KanbanSquare />
                  Open project board
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void chooseProject()}>
                  <FolderOpen />
                  Change folder…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onChange({ projectPath: null })}>
                  Stop using this folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}

        {!props.singlePane && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 items-center px-1.5">
                <Switch
                  aria-label="Include in broadcast"
                  checked={pane.included}
                  onCheckedChange={(checked) => onChange({ included: checked })}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {pane.included ? "Included in broadcast" : "Excluded from broadcast"}
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Pane options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{pane.name}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setDraftName(pane.name);
                setEditingName(true);
              }}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={pane.memoryEnabled}
              onCheckedChange={(checked) => onChange({ memoryEnabled: checked })}
            >
              <Brain />
              Use session memory
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={pane.planMode}
              onCheckedChange={(checked) => onChange({ planMode: checked })}
            >
              <ClipboardList />
              Plan mode (read only)
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={props.onChooseAgent}>
              <Bot />
              {props.agentName ? "Change agent…" : "Choose agent…"}
            </DropdownMenuItem>
            {props.agentName && (
              <DropdownMenuItem onSelect={() => onChange({ agentPath: null })}>
                Stop using {props.agentName}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!lastAssistant}
              onSelect={() => {
                if (lastAssistant) void navigator.clipboard.writeText(lastAssistant.content);
              }}
            >
              <Copy />
              Copy last reply
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasPrompt} onSelect={onRetry}>
              <RotateCcw />
              Retry last prompt
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasPrompt} onSelect={props.onUndo}>
              <Undo2 />
              Undo last exchange
            </DropdownMenuItem>
            {props.onShowContext && (
              <DropdownMenuItem onSelect={props.onShowContext}>
                <ScanEye />
                What the model saw
              </DropdownMenuItem>
            )}
            {props.onExport && (
              <>
                <DropdownMenuItem
                  disabled={pane.messages.length === 0}
                  onSelect={() => props.onExport?.("markdown")}
                >
                  <FileDown />
                  Export as Markdown…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={pane.messages.length === 0}
                  onSelect={() => props.onExport?.("html")}
                >
                  <FileDown />
                  Export as web page…
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem disabled={!canCompact} onSelect={props.onCompact}>
              <Shrink />
              Compact conversation
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pane.messages.length === 0 && pane.lastError === null}
              onSelect={() =>
                onChange({ messages: [], promptTokens: 0, completionTokens: 0, lastError: null })
              }
            >
              <Eraser />
              Clear conversation
            </DropdownMenuItem>
            {!props.singlePane && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                  <Trash2 />
                  Remove pane
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {scrolledUp && (
          <Button
            size="xs"
            variant="secondary"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-lg shadow-black/30"
          >
            <ArrowDown />
            Jump to latest
          </Button>
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {pane.messages.length === 0 && pane.lastError === null ? (
            !isConfigured ? (
              <NotReadyState
                label={provider.label}
                connection={connection}
                onOpenSettings={props.onOpenSettings}
              />
            ) : pane.modelId === "" ? (
              <EmptyState
                icon={Sparkles}
                title="Pick a model"
                description="Choose a model from the header to start this conversation."
              />
            ) : props.singlePane ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-10 text-center">
                <span
                  aria-hidden
                  className="grid size-12 place-items-center rounded-xl bg-primary/15 font-serif text-xl font-bold text-primary"
                >
                  Z
                </span>
                <p className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                  What are we working on?
                </p>
                <ul className="flex max-w-md flex-col gap-2 text-left text-xs text-muted-foreground">
                  <li className="flex items-baseline gap-2.5">
                    <kbd className="w-9 shrink-0 rounded border border-border px-1 text-center font-mono text-[10px]">
                      /
                    </kbd>
                    Run a skill or command, or type /help for everything Zenith can do.
                  </li>
                  <li className="flex items-baseline gap-2.5">
                    <kbd className="w-9 shrink-0 rounded border border-border px-1 text-center font-mono text-[10px]">
                      {navigator.userAgent.includes("Mac") ? "⌘K" : "Ctrl K"}
                    </kbd>
                    Search or ask about every past session.
                  </li>
                  <li className="flex items-baseline gap-2.5">
                    <span className="flex w-9 shrink-0 translate-y-0.5 justify-center">
                      <FolderOpen className="size-3.5 text-primary" aria-hidden />
                    </span>
                    {pane.projectPath
                      ? `Working in ${folderName(pane.projectPath)}. Agents read it freely and ask before every change.`
                      : "Choose a project folder above so agents can read and change its files, with your approval."}
                  </li>
                </ul>
              </div>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Ready"
                description="Send from the composer to every included pane, or use the reply button below to message only this one."
              />
            )
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
              {pane.messages.map((message, index) =>
                message.role === "user" ? (
                  // Your prompt sits on the right as a bubble, as in Cursor; the reply reads as
                  // plain text below it.
                  <div key={message.id} className="group/prompt flex items-start justify-end gap-2">
                    {props.onRestore && !streaming && (
                      <RestoreButton onRestore={() => props.onRestore?.(message.id)} />
                    )}
                    <div className="flex min-w-0 max-w-[85%] flex-col gap-2 rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-[13.5px] leading-relaxed text-foreground">
                      {message.images?.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {message.images.map((image) => (
                            <AttachmentImage
                              key={image.id}
                              id={image.id}
                              className="max-h-40 max-w-60 rounded-lg border border-border object-contain"
                            />
                          ))}
                        </span>
                      ) : null}
                      <span className="whitespace-pre-wrap break-words">{message.content}</span>
                    </div>
                  </div>
                ) : message.role === "assistant" ? (
                  <div key={message.id} className="group flex flex-col gap-1.5">
                    {/* Who answered, so a transcript read later names the connection itself. */}
                    <span className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className={cn("size-1.5 rounded-full", provider.dotClass)}
                        aria-hidden
                      />
                      {provider.label}
                    </span>
                    <Markdown content={message.content} />
                    {!(streaming && index === pane.messages.length - 1) && (
                      <MessageActions
                        content={message.content}
                        isLast={index === pane.messages.length - 1}
                        onBranch={() => props.onBranch(message.id)}
                        branchLabel={
                          props.singlePane ? "Branch into new session" : "Branch into new pane"
                        }
                        onRetry={onRetry}
                        onUndo={props.onUndo}
                        onRemember={() => props.onRemember(message.content)}
                        {...(props.onSaveSkill
                          ? { onSaveSkill: () => props.onSaveSkill?.(message.id) }
                          : {})}
                      />
                    )}
                  </div>
                ) : (
                  <details
                    key={message.id}
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px]"
                  >
                    <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
                      Summary of earlier messages
                    </summary>
                    <div className="mt-2">
                      <Markdown content={message.content} />
                    </div>
                  </details>
                ),
              )}

              {pane.planMode && !streaming && lastMessage?.role === "assistant" && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  <ClipboardList className="size-4 shrink-0 text-warning" aria-hidden />
                  <span className="flex-1 text-foreground">
                    Plan mode is on, so nothing was changed.
                  </span>
                  <Button size="xs" onClick={props.onBuildPlan}>
                    Build this plan
                  </Button>
                </div>
              )}

              {props.agentTurn && (
                <AgentPanel
                  turn={props.agentTurn}
                  streaming={streaming}
                  onRollback={props.onRollback}
                  projectPath={pane.projectPath}
                  {...(props.onFixGates ? { onFixGates: props.onFixGates } : {})}
                  reviewer={reviewer}
                />
              )}

              {compacting && (
                <p
                  role="status"
                  className="text-xs text-muted-foreground motion-safe:animate-pulse"
                >
                  Compacting earlier messages…
                </p>
              )}

              {props.permissions.map((request) => (
                <PermissionCard
                  key={request.permissionId}
                  request={request}
                  onRespond={(optionId) =>
                    props.onRespondPermission(request.permissionId, optionId)
                  }
                  {...(props.onAlwaysDeny && props.deniedRules?.includes(denyRuleFor(request) ?? "")
                    ? { onAlwaysDeny: (rule: string) => props.onAlwaysDeny?.(request, rule) }
                    : {})}
                />
              ))}

              {awaitingReply && props.permissions.length === 0 && (
                <div
                  className="flex items-center gap-1.5 py-1"
                  role="status"
                  aria-label="Waiting for reply"
                >
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className={cn("size-1.5 rounded-full animate-typing", provider.dotClass)}
                      style={{ animationDelay: `${dot * 160}ms` }}
                    />
                  ))}
                </div>
              )}

              {pane.lastError !== null && (
                <div
                  role="alert"
                  className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-[13px] leading-relaxed text-foreground">{pane.lastError}</p>
                    <div className="flex gap-1.5">
                      {missingKeyError ? (
                        <Button size="xs" variant="outline" onClick={props.onOpenSettings}>
                          <KeyRound />
                          Add API key
                        </Button>
                      ) : (
                        <Button size="xs" variant="outline" onClick={onRetry}>
                          <RotateCcw />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-0 pt-1 text-muted-foreground">
        {replyOpen && (
          <form
            className="relative mb-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              submitReply();
            }}
          >
            <Input
              autoFocus
              aria-label={`Reply to ${pane.name}`}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && reply === "") setReplyOpen(false);
              }}
              disabled={!canSend}
              placeholder={canSend ? `Reply to ${replyTarget}…` : "Unavailable until configured"}
              className="h-9 pr-10"
            />
            {streaming ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                aria-label="Stop reply"
                onClick={props.onStop}
                className="absolute right-1 top-1"
              >
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send reply"
                disabled={!canSend || reply.trim() === ""}
                className="absolute right-1 top-1"
              >
                <ArrowUp />
              </Button>
            )}
          </form>
        )}
        <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {!props.singlePane && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={replyOpen ? "secondary" : "ghost"}
                    size="icon-xs"
                    aria-label={replyOpen ? "Hide reply box" : `Reply only to ${pane.name}`}
                    aria-expanded={replyOpen}
                    onClick={() => setReplyOpen((open) => !open)}
                  >
                    <MessageSquareReply />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {replyOpen ? "Hide reply box" : "Reply only to this pane"}
                </TooltipContent>
              </Tooltip>
            )}
            {streaming && !replyOpen && (
              <Button variant="ghost" size="icon-xs" aria-label="Stop reply" onClick={props.onStop}>
                <Square className="fill-current" />
              </Button>
            )}
            {!props.singlePane && <span className="truncate">{pane.name}</span>}
            {pane.memoryEnabled && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                <Brain className="size-2.5" aria-hidden />
                memory
              </span>
            )}
            {props.agentName && (
              <span className="flex min-w-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                <Bot className="size-2.5 shrink-0" aria-hidden />
                <span className="truncate">{props.agentName}</span>
              </span>
            )}
            {pane.planMode && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">
                <ClipboardList className="size-2.5" aria-hidden />
                plan
              </span>
            )}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 cursor-default items-center gap-1.5 text-[11.5px] tabular-nums">
                {contextShare !== undefined && (
                  <span
                    role="meter"
                    aria-label="Context used"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(contextShare * 100)}
                    className="h-1 w-10 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        contextShare >= COMPACT_THRESHOLD ? "bg-warning" : "bg-primary/70",
                      )}
                      style={{ width: `${Math.max(contextShare * 100, 2)}%` }}
                    />
                  </span>
                )}
                {formatTokens(contextTokens)}
                {limit ? ` / ${formatTokens(limit)}` : " tok"}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {pane.promptTokens} prompt · {pane.completionTokens} completion
              {limit
                ? ` · ${Math.round((contextShare ?? 0) * 100)}% of a ${formatTokens(limit)} context window. Compacts automatically at ${COMPACT_THRESHOLD * 100}%.`
                : ""}
              {provider.kind === "cli" &&
                ` Prompt tokens include instructions ${provider.label} adds to every request (about 550–750 for Claude Code), which Zenith can't remove.`}
            </TooltipContent>
          </Tooltip>
        </div>
      </footer>
    </section>
  );
}
