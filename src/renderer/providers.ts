import type { ConnectionKind, ConnectionStatus } from "../shared/types";

export interface ProviderMeta {
  id: string;
  label: string;
  kind: ConnectionKind;
  dotClass: string;
}

// Listed in auto-setup priority order.
export const PROVIDERS: readonly ProviderMeta[] = [
  { id: "claude-code", label: "Claude Code", kind: "cli", dotClass: "bg-provider-claude-code" },
  { id: "gemini-cli", label: "Gemini CLI", kind: "cli", dotClass: "bg-provider-gemini-cli" },
  { id: "copilot-cli", label: "Copilot CLI", kind: "cli", dotClass: "bg-provider-copilot-cli" },
  { id: "ollama", label: "Ollama", kind: "local", dotClass: "bg-provider-ollama" },
  { id: "lmstudio", label: "LM Studio", kind: "local", dotClass: "bg-provider-lmstudio" },
  { id: "hermes", label: "Hermes Agent", kind: "agent", dotClass: "bg-provider-hermes" },
  { id: "opencode", label: "OpenCode", kind: "agent", dotClass: "bg-provider-opencode" },
  { id: "anthropic", label: "Anthropic", kind: "api-key", dotClass: "bg-provider-anthropic" },
  { id: "openai", label: "OpenAI", kind: "api-key", dotClass: "bg-provider-openai" },
  { id: "openrouter", label: "OpenRouter", kind: "api-key", dotClass: "bg-provider-openrouter" },
];

export const DEFAULT_CLI_MODEL_ID = "default";

// CLI tools and agents start on their own default model; other kinds need a model picked.
export function usesDefaultModel(kind: ConnectionKind): boolean {
  return kind === "cli" || kind === "agent";
}

// Names and kinds of connections Zenith doesn't list above (user-added providers, extra agents),
// learned from the connection list.
const connectionInfo = new Map<string, { label: string; kind: ConnectionKind }>();

export function rememberConnectionLabels(connections: ConnectionStatus[]): void {
  for (const connection of connections) {
    connectionInfo.set(connection.id, { label: connection.label, kind: connection.kind });
  }
}

export function providerMeta(id: string): ProviderMeta {
  const known = connectionInfo.get(id);
  return (
    PROVIDERS.find((provider) => provider.id === id) ?? {
      id,
      label: known?.label ?? id,
      kind: known?.kind ?? "api-key",
      dotClass: known?.kind === "agent" ? "bg-primary" : "bg-muted-foreground",
    }
  );
}

export function readyProviderIds(connections: ConnectionStatus[]): string[] {
  return connections.filter((connection) => connection.state === "ready").map((c) => c.id);
}

export function preferredConnection(connections: ConnectionStatus[]): ConnectionStatus | undefined {
  const ready = new Set(readyProviderIds(connections));
  const provider = PROVIDERS.find((candidate) => ready.has(candidate.id));
  return provider && connections.find((connection) => connection.id === provider.id);
}

export interface ProviderGroup {
  label: string;
  providers: ProviderMeta[];
}

// Every provider the picker can offer, grouped. API providers come from the connection list: the
// ones the user added, plus built-in ones with a saved key. The pane's current provider stays
// listed so its selection still shows.
function providerGroups(connections: ConnectionStatus[], currentId: string): ProviderGroup[] {
  const current = providerMeta(currentId);
  const listed = new Set(PROVIDERS.map((provider) => provider.id));
  const extraAgentIds = new Set(
    connections
      .filter((connection) => connection.kind === "agent" && !listed.has(connection.id))
      .map((connection) => connection.id),
  );
  if (current.kind === "agent" && !listed.has(currentId)) extraAgentIds.add(currentId);
  const apiIds = new Set(
    connections.filter((connection) => connection.kind === "api-key").map((c) => c.id),
  );
  if (current.kind === "api-key") apiIds.add(currentId);
  return [
    {
      label: "On this computer",
      providers: PROVIDERS.filter((p) => p.kind === "cli" || p.kind === "local"),
    },
    {
      label: "Agents",
      // Other ACP agents installed on this computer follow the built-in ones.
      providers: [
        ...PROVIDERS.filter((p) => p.kind === "agent"),
        ...[...extraAgentIds].map((id) => providerMeta(id)),
      ],
    },
    { label: "API providers", providers: [...apiIds].map((id) => providerMeta(id)) },
  ].filter((group) => group.providers.length > 0);
}

// The provider picker lists only what can be used now, plus the pane's current provider so the
// trigger never goes blank. Everything else collapses into one entry that opens Settings ›
// Assistants. With nothing ready at all, it keeps the always-listed providers so there is still
// something to pick, and the entry offers setup instead.
export function pickerGroups(
  connections: ConnectionStatus[],
  currentId: string,
): { groups: ProviderGroup[]; more: string | null } {
  const ready = new Set(readyProviderIds(connections));
  const all = providerGroups(connections, currentId);
  if (ready.size === 0) return { groups: all, more: "Set up an assistant…" };
  const groups = all
    .map((group) => ({
      ...group,
      providers: group.providers.filter((p) => ready.has(p.id) || p.id === currentId),
    }))
    .filter((group) => group.providers.length > 0);
  const count = (list: ProviderGroup[]) =>
    list.reduce((sum, group) => sum + group.providers.length, 0);
  const hidden = count(all) - count(groups);
  return { groups, more: hidden > 0 ? `More assistants (${hidden})…` : null };
}
