import {
  AlertCircle,
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
import { PERMISSION_RULES_EXAMPLE } from "../shared/permissions";
import type { ConnectionStatus, PersonaFile, SandboxStatus } from "../shared/types";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
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
    <section className="flex flex-col gap-2.5 border border-border bg-card p-4">
      <h3 className="eyebrow text-success">
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
    <section className="flex flex-col gap-2.5 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="eyebrow text-success">{props.title}</h3>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function ConnectionsSection(props: {
  connections: ConnectionStatus[];
  refreshing: boolean;
  onRefresh(): void;
}) {
  const tools = props.connections.filter((connection) => connection.kind !== "api-key");
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
      <ul className="flex flex-col divide-y divide-border border border-border">
        {tools.length === 0 ? (
          <li className="p-4 text-[13px] text-muted-foreground">Checking this computer…</li>
        ) : (
          tools.map((connection) => (
            <li key={connection.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full",
                  providerMeta(connection.id).dotClass,
                  connection.state !== "ready" && "opacity-35",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{connection.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {connection.detail}
                </span>
              </div>
              <StatusIcon state={connection.state} />
            </li>
          ))
        )}
      </ul>
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
      <ul className="flex flex-col divide-y divide-border border border-border">
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
          className="grid gap-3 border border-border bg-background/40 p-4 sm:grid-cols-2"
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
                "flex w-full cursor-pointer flex-col gap-2 border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                theme === item.id
                  ? "border-primary bg-primary/[0.06]"
                  : "border-border hover:border-input",
              )}
            >
              <span className="flex h-8 overflow-hidden border border-border">
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

export function PermissionsSection() {
  return (
    <Section title="Agent permissions">
      <TextSettingEditor
        store={window.zenith.permissions}
        label="Agent permission rules"
        description={
          'One rule per line: allow, ask, or deny, a tool name (Read, Edit, Write, Bash, mcp__server__tool; * for any), and an optional pattern for the command or path, where * matches anything. The last matching rule wins. "allow Bash" never matches commands that chain or redirect with ; & | $ < >. Applies to Claude Code and Zenith\'s own agent.'
        }
        placeholder={PERMISSION_RULES_EXAMPLE}
      />
    </Section>
  );
}
