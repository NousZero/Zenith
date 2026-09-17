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
