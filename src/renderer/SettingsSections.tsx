import {
  AlertCircle,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  PROVIDER_PRESETS,
  type CustomProvider,
  type ProviderApi,
} from "../shared/custom-providers";
import { PERMISSION_RULES_EXAMPLE, POSTURES, postureOf, type Posture } from "../shared/permissions";
import type { AuditEntry, ConnectionStatus, PersonaFile, SandboxStatus } from "../shared/types";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { EXTRAS, type ExtraId } from "./extras";
import { cn } from "./lib/utils";
import { providerMeta } from "./providers";
import { applyTheme, storedTheme, THEMES, type ThemeId } from "./themes";

function StatusIcon({ state }: { state: ConnectionStatus["state"] }) {
  if (state === "ready") return <CheckCircle2 className="size-4 text-success" aria-label="Ready" />;
  if (state === "sign-in-required") {
    return <AlertCircle className="size-4 text-warning" aria-label="Sign-in required" />;
  }
  return <CircleDashed className="size-4 text-muted-foreground" aria-label="Unavailable" />;
}

export function PersonaFileEditor(props: {
  file: PersonaFile;
  title: string;
  description: string;
  placeholder: string;
  text: string;
  onSave(file: PersonaFile, text: string): Promise<void>;
}) {
  // null means the draft still matches the saved file.
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const value = draft ?? props.text;

  async function save() {
    setStatus("saving");
    try {
      await props.onSave(props.file, value);
      setDraft(null);
      setStatus("idle");
    } catch (error: unknown) {
      console.error(`Failed to save ${props.file}:`, error);
      setStatus("error");
    }
  }

  return (
    <section className="flex flex-col gap-2.5 border border-border bg-card p-4 rounded-lg">
      <h3 className="text-[13px] font-semibold text-foreground">
        {props.title} ({props.file})
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{props.description}</p>
      <Textarea
        aria-label={props.file}
        rows={5}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={props.placeholder}
        className="resize-y font-mono text-xs"
      />
      <div className="flex items-center justify-end gap-2">
        {status === "error" && (
          <span className="text-xs text-danger">Could not save {props.file}.</span>
        )}
        <Button
          size="sm"
          disabled={draft === null || status === "saving"}
          onClick={() => void save()}
        >
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

const MCP_EXAMPLE = `{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"] }
  }
}`;

// A text setting validated by the main process: mcp.json or the agent permission rules.
function TextSettingEditor(props: {
  store: { get(): Promise<string>; set(text: string): Promise<string | null> };
  label: string;
  description: string;
  placeholder: string;
}) {
  const { store } = props;
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  useEffect(() => {
    let cancelled = false;
    store
      .get()
      .then((value) => {
        if (!cancelled) {
          setText(value);
          setSaved(value);
        }
      })
      .catch((error: unknown) => console.error(`Failed to read ${props.label}:`, error));
    return () => {
      cancelled = true;
    };
  }, [store, props.label]);

  async function save() {
    if (text === null) return;
    const error = await store.set(text);
    if (error) {
      setStatus({ kind: "error", message: error });
    } else {
      setSaved(text);
      setStatus({ kind: "saved", message: "Saved. Used by agents from their next reply." });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-muted-foreground">{props.description}</p>
      <Textarea
        aria-label={props.label}
        rows={6}
        value={text ?? ""}
        disabled={text === null}
        onChange={(event) => {
          setText(event.target.value);
          setStatus({ kind: "idle", message: "" });
        }}
        placeholder={props.placeholder}
        spellCheck={false}
        className="resize-y font-mono text-xs"
      />
      <div className="flex items-center justify-end gap-2">
        {status.kind !== "idle" && (
          <span
            role={status.kind === "error" ? "alert" : "status"}
            className={cn(
              "text-xs",
              status.kind === "error" ? "text-danger" : "text-muted-foreground",
            )}
          >
            {status.message}
          </span>
        )}
        <Button size="sm" disabled={text === null || text === saved} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

// One titled block on a workbench page.
export function Section(props: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border border-border bg-card p-4 rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-foreground">{props.title}</h3>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

// Ready first, then what is one sign-in away, then what isn't set up on this computer yet.
const STATE_ORDER: Record<ConnectionStatus["state"], number> = {
  ready: 0,
  "sign-in-required": 1,
  "not-running": 2,
  "not-installed": 3,
  "needs-key": 4,
};

function ConnectionRow({ connection }: { connection: ConnectionStatus }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-1.5 size-2.5 shrink-0 rounded-full",
          providerMeta(connection.id).dotClass,
          connection.state !== "ready" && "opacity-35",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{connection.label}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{connection.detail}</span>
      </div>
      <StatusIcon state={connection.state} />
    </li>
  );
}

export function ConnectionsSection(props: {
  connections: ConnectionStatus[];
  refreshing: boolean;
  onRefresh(): void;
}) {
  const tools = props.connections
    .filter((connection) => connection.kind !== "api-key")
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  // What isn't set up yet stays one click away, so the page opens on what can be used.
  const usable = tools.filter((c) => STATE_ORDER[c.state] <= STATE_ORDER["sign-in-required"]);
  const notSetUp = tools.filter((c) => STATE_ORDER[c.state] > STATE_ORDER["sign-in-required"]);
  return (
    <Section
      title="On this computer"
      actions={
        <Button variant="ghost" size="xs" onClick={props.onRefresh} disabled={props.refreshing}>
          <RefreshCw className={cn(props.refreshing && "motion-safe:animate-spin")} />
          {props.refreshing ? "Checking…" : "Refresh"}
        </Button>
      }
    >
      {tools.length === 0 ? (
        <ul className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
          <li className="p-4 text-[13px] text-muted-foreground">Checking this computer…</li>
        </ul>
      ) : (
        <>
          {usable.length > 0 && (
            <ul className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
              {usable.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))}
            </ul>
          )}
          {notSetUp.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer select-none text-muted-foreground">
                Not installed or not running ({notSetUp.length})
              </summary>
              <ul className="mt-2 flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
                {notSetUp.map((connection) => (
                  <ConnectionRow key={connection.id} connection={connection} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        CLI tools run read-only in an empty folder with their own sign-in. Agents work in that
        folder with their own tools and ask you before risky actions. Zenith never reads saved
        credentials.
      </p>
    </Section>
  );
}

const LEGACY_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
];

interface ProviderDraft {
  id?: string;
  preset: string;
  name: string;
  api: ProviderApi;
  baseUrl: string;
  apiKey: string;
  models: string;
  hasKey: boolean;
}

const EMPTY_DRAFT: ProviderDraft = {
  preset: "OpenAI",
  name: "OpenAI",
  api: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  models: "",
  hasKey: false,
};

const fieldClass =
  "h-8 w-full border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
}

// One place for every API provider: a name, the API style, the address, the key, and models.
export function ProvidersSection(props: { onChanged(): void }) {
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [legacyKeys, setLegacyKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.zenith.customProviders.list(), window.zenith.credentials.list()])
      .then(([list, keys]) => {
        if (cancelled) return;
        setProviders(list);
        setLegacyKeys(keys.filter((key) => LEGACY_PROVIDERS.some((item) => item.id === key)));
      })
      .catch((caught: unknown) => console.error("Failed to list providers:", caught));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<ProviderDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  async function save() {
    if (!draft) return;
    try {
      setProviders(
        await window.zenith.customProviders.save({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          api: draft.api,
          baseUrl: draft.baseUrl,
          models: draft.models.split(/[\n,]/),
          apiKey: draft.apiKey,
        }),
      );
      setDraft(null);
      setError("");
      props.onChanged();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  }

  async function remove(id: string) {
    setProviders(await window.zenith.customProviders.remove(id));
    props.onChanged();
  }

  async function removeLegacy(id: string) {
    await window.zenith.credentials.delete(id);
    setLegacyKeys((current) => current.filter((key) => key !== id));
    props.onChanged();
  }

  return (
    <Section
      title="Credential vault · providers"
      actions={
        !draft && (
          <Button size="xs" variant="outline" onClick={() => setDraft(EMPTY_DRAFT)}>
            <Plus />
            Add provider
          </Button>
        )
      }
    >
      <ul className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
        {providers.length === 0 && legacyKeys.length === 0 && (
          <li className="p-4 text-xs text-muted-foreground">
            No API providers yet. Add one with its base URL and API key: OpenAI, Anthropic,
            OpenRouter, or any OpenAI-compatible server.
          </li>
        )}
        {providers.map((provider) => (
          <li key={provider.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{provider.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {provider.api === "anthropic" ? "Anthropic" : "OpenAI-compatible"} ·{" "}
                {provider.baseUrl}
                {provider.models.length > 0 ? ` · ${provider.models.join(", ")}` : ""}
              </span>
            </div>
            <span
              className={cn("text-xs", provider.hasKey ? "text-success" : "text-muted-foreground")}
            >
              {provider.hasKey ? "Key saved" : "No key"}
            </span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                setDraft({
                  id: provider.id,
                  preset: "Custom",
                  name: provider.name,
                  api: provider.api,
                  baseUrl: provider.baseUrl,
                  apiKey: "",
                  models: provider.models.join(", "),
                  hasKey: provider.hasKey,
                })
              }
            >
              <Pencil />
              Edit
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Remove ${provider.name}`}
              className="text-danger hover:text-danger"
              onClick={() => void remove(provider.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {legacyKeys.map((id) => (
          <li key={id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">
                {LEGACY_PROVIDERS.find((item) => item.id === id)?.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Key saved before custom providers; still works in panes.
              </span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => void removeLegacy(id)}
            >
              Remove key
            </Button>
          </li>
        ))}
      </ul>

      {draft && (
        <form
          className="grid gap-3 border border-border bg-background/40 p-4 sm:grid-cols-2 rounded-lg"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {!draft.id && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              Start from
              <select
                className={fieldClass}
                value={draft.preset}
                onChange={(event) => {
                  const preset = PROVIDER_PRESETS.find((item) => item.name === event.target.value);
                  if (!preset) return;
                  update({
                    preset: preset.name,
                    name: preset.name === "Custom" ? "" : preset.name,
                    api: preset.api,
                    baseUrl: preset.baseUrl,
                  });
                }}
              >
                {PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Name
            <input
              className={fieldClass}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="My provider"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            API type
            <select
              className={fieldClass}
              value={draft.api}
              onChange={(event) => update({ api: event.target.value as ProviderApi })}
            >
              <option value="openai">OpenAI-compatible (chat completions)</option>
              <option value="anthropic">Anthropic (messages)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Base URL
            <input
              className={cn(fieldClass, "font-mono")}
              value={draft.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            API key
            <input
              className={cn(fieldClass, "font-mono")}
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={
                draft.hasKey
                  ? "Saved; type to replace"
                  : "Paste the API key (optional for local servers)"
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Models (optional, comma-separated; empty asks the server for its list)
            <input
              className={cn(fieldClass, "font-mono")}
              value={draft.models}
              onChange={(event) => update({ models: event.target.value })}
              placeholder="gpt-5-mini, gpt-5"
              spellCheck={false}
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!draft.name.trim() || !draft.baseUrl.trim()}>
              Save provider
            </Button>
          </div>
        </form>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Keys are encrypted with your operating system's secure storage and never shown again. Saved
        providers appear in the pane's provider menu.
      </p>
    </Section>
  );
}

export function AppearanceSection() {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  return (
    <Section title="Theme">
      <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {THEMES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={theme === item.id}
              onClick={() => {
                applyTheme(item.id);
                setTheme(item.id);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col gap-2 border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
                theme === item.id
                  ? "border-primary bg-primary/[0.06]"
                  : "border-border hover:border-input",
              )}
            >
              <span className="flex h-8 overflow-hidden border border-border rounded-md">
                {item.swatches.map((color) => (
                  <span key={color} className="flex-1" style={{ background: color }} />
                ))}
              </span>
              <span className="flex items-center justify-between text-xs">
                {item.label}
                <span className="font-mono text-[10px] text-muted-foreground">{item.scheme}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const AUDIT_KIND_LABEL: Record<AuditEntry["kind"], string> = {
  approval: "Approval",
  command: "Command",
  edit: "Edit",
  rollback: "Undo",
  gate: "Checks",
};

const AUDIT_BAD_OUTCOMES = new Set(["failed", "denied", "fail", "reject_once", "reject_always"]);

// Read-only record of what agents did and what was decided, newest first.
export function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const load = () =>
    window.zenith.audit
      .list(200)
      .then(setEntries)
      .catch(() => setEntries([]));
  useEffect(() => {
    let cancelled = false;
    window.zenith.audit
      .list(200)
      .then((items) => {
        if (!cancelled) setEntries(items);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      title="Activity record"
      actions={
        <Button size="xs" variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        Every approval you answered, command an agent ran, file it changed, undo, and check, kept on
        this computer after the conversation is gone. Keys and passwords are masked before they are
        written; the newest 5,000 entries are kept.
      </p>
      {entries && entries.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
      )}
      {entries && entries.length > 0 && (
        <ol
          aria-label="Activity record"
          className="max-h-80 overflow-y-auto border border-border font-mono text-[11px] rounded-lg"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="grid grid-cols-[7.5rem_4.5rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border px-3 py-1.5 last:border-b-0"
            >
              <time className="text-muted-foreground" dateTime={new Date(entry.at).toISOString()}>
                {new Date(entry.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <span className="text-muted-foreground">{AUDIT_KIND_LABEL[entry.kind]}</span>
              <span className="truncate" title={entry.projectPath ?? undefined}>
                {entry.summary}
              </span>
              <span
                className={
                  AUDIT_BAD_OUTCOMES.has(entry.outcome) ? "text-danger" : "text-muted-foreground"
                }
              >
                {entry.outcome.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

const REPORT_LOG_BYTES = 32_000; // Roughly the last ~200 lines.

// Local error log for "Report a problem": nothing here leaves the computer unless the user
// copies or saves it themselves.
export function ErrorLogSection() {
  const [log, setLog] = useState("");
  const [copied, setCopied] = useState(false);
  const load = () => window.zenith.log.recent(REPORT_LOG_BYTES).then(setLog);
  useEffect(() => {
    void load();
  }, []);

  const copyReport = async () => {
    const [info, recent] = await Promise.all([
      window.zenith.log.appInfo(),
      window.zenith.log.recent(REPORT_LOG_BYTES),
    ]);
    const report = [
      `Zenith ${info.version}`,
      `${info.platform} ${info.osVersion}, Electron ${info.electron}`,
      "",
      recent || "(log is empty)",
    ].join("\n");
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section
      title="Report a problem"
      actions={
        <Button size="xs" variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        Errors Zenith runs into are kept in a local log file, never sent anywhere. Copy a report to
        share what happened, or open the file directly.
      </p>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all border border-border bg-secondary/40 p-2 font-mono text-[11px] text-muted-foreground rounded-lg">
        {log || "Nothing logged yet."}
      </pre>
      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => void window.zenith.log.openFolder()}>
          Open log folder
        </Button>
        <Button size="xs" variant="outline" onClick={() => void copyReport()}>
          {copied ? "Copied" : "Copy report"}
        </Button>
      </div>
    </Section>
  );
}

export function SandboxSection() {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.zenith.sandbox
      .status()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      title="Sandboxed commands"
      actions={
        status?.available ? (
          <Switch
            aria-label="Run agent commands in the sandbox"
            checked={status.enabled}
            onCheckedChange={(checked) => void window.zenith.sandbox.set(checked).then(setStatus)}
          />
        ) : undefined
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        Agent commands run in {status?.available ?? "the operating system's sandbox"}: no network
        except this computer's own addresses, and changes only inside the project folder. Commands
        that stay inside it run without asking. If the sandbox blocks one, the agent can ask to run
        it outside, and you decide. Applies to Zenith's own agent and Claude Code; your permission
        rules still apply, and undo still covers the project.
      </p>
      {status && !status.available && (
        <p className="text-xs text-warning">
          {navigator.userAgent.includes("Linux")
            ? "Install bubblewrap (bwrap) to use this on Linux."
            : "This system has no supported sandbox yet, so commands keep asking."}
        </p>
      )}
    </Section>
  );
}

export function McpSection() {
  return (
    <Section title="MCP servers (mcp.json)">
      <TextSettingEditor
        store={window.zenith.mcp}
        label="mcp.json"
        description="Extra tools for agents in project folders: Claude Code, Zenith's own agent, Hermes Agent, and OpenCode. Agents ask you before using them."
        placeholder={MCP_EXAMPLE}
      />
    </Section>
  );
}

export function PermissionsSection(props: { onChanged?: () => void }) {
  const [rules, setRules] = useState<string | null>(null);
  // Bumped after a posture is chosen, so the rules editor below reloads with the new text.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    window.zenith.permissions
      .get()
      .then((text) => {
        if (!cancelled) setRules(text);
      })
      .catch((error: unknown) => console.error("Failed to read the permission rules:", error));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const current = rules === null ? undefined : postureOf(rules);
  const hasOwnRules = rules !== null && current === undefined && rules.trim() !== "";

  async function choose(posture: Posture) {
    const error = await window.zenith.permissions.set(posture.rules);
    if (error) {
      console.error("Failed to save the permission rules:", error);
      return;
    }
    setVersion((value) => value + 1);
    props.onChanged?.();
  }

  return (
    <Section title="How much agents may do">
      <p className="text-xs leading-relaxed text-muted-foreground">
        One choice sets every rule. Whatever you pick, anything outside the project folder still
        asks, and edits show a diff before they happen.
      </p>
      <ul className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {POSTURES.map((posture) => {
          const active = current?.id === posture.id;
          return (
            <li key={posture.id}>
              <button
                type="button"
                aria-pressed={active}
                disabled={rules === null}
                onClick={() => void choose(posture)}
                className={cn(
                  "flex h-full w-full cursor-pointer flex-col gap-1.5 border bg-card p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
                  active
                    ? "border-primary/60 bg-primary/[0.06]"
                    : "border-border hover:border-input",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{posture.label}</span>
                  {active && <span className="eyebrow text-primary">In use</span>}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {posture.summary}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasOwnRules && (
        <p className="text-xs text-muted-foreground">
          Your rules don&apos;t match any of these. Choosing one replaces them.
        </p>
      )}
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
          Write the rules yourself
        </summary>
        <div className="mt-2.5">
          <TextSettingEditor
            key={version}
            store={window.zenith.permissions}
            label="Agent permission rules"
            description={
              'One rule per line: allow, ask, or deny, a tool name (Read, Edit, Write, Bash, mcp__server__tool; * for any), and an optional pattern for the command or path, where * matches anything. The last matching rule wins. "allow Bash" never matches commands that chain or redirect with ; & | $ < >. Applies to Claude Code and Zenith\'s own agent.'
            }
            placeholder={PERMISSION_RULES_EXAMPLE}
          />
        </div>
      </details>
    </Section>
  );
}

export function ExtrasSection(props: {
  extras: Record<ExtraId, boolean>;
  onToggle(id: ExtraId, enabled: boolean): void;
  onOpenBots(): void;
  onOpenSchedule(): void;
  onOpenInsights(): void;
}) {
  return (
    <>
      <Section title="Extras">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Features outside the core loop of picking a folder, asking, watching, reviewing, and
          keeping or undoing changes. Off by default; anything already in use when this list was
          added stays on.
        </p>
        <ul className="flex flex-col divide-y divide-border border border-border rounded-lg overflow-hidden">
          {EXTRAS.map((extra) => (
            <li key={extra.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{extra.label}</span>
                <span className="text-xs text-muted-foreground">{extra.description}</span>
              </span>
              <Switch
                aria-label={extra.label}
                checked={props.extras[extra.id]}
                onCheckedChange={(checked) => props.onToggle(extra.id, checked)}
              />
            </li>
          ))}
        </ul>
      </Section>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {[
          {
            icon: Bot,
            title: "Bots",
            text: "Chat with Zenith from Telegram, Discord, Slack, WhatsApp, Signal, or Home Assistant. Only people you pair are answered, and bots never run tools.",
            open: props.onOpenBots,
          },
          {
            icon: CalendarClock,
            title: "Scheduled tasks",
            text: "Run a prompt on a schedule while Zenith is open, and get the result here or through a bot.",
            open: props.onOpenSchedule,
          },
          {
            icon: BarChart3,
            title: "Usage insights",
            text: "Tokens and messages by connection and model across all your sessions.",
            open: props.onOpenInsights,
          },
        ].map((card) => (
          <li key={card.title}>
            <button
              type="button"
              onClick={card.open}
              className="flex h-full w-full cursor-pointer flex-col gap-2 border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <card.icon className="size-5 text-primary" aria-hidden />
              <span className="text-sm font-medium">{card.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{card.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
