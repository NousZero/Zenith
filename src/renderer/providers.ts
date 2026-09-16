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

// Names of providers the user added, learned from the connection list.
const connectionLabels = new Map<string, string>();

export function rememberConnectionLabels(connections: ConnectionStatus[]): void {
  for (const connection of connections) connectionLabels.set(connection.id, connection.label);
}

export function providerMeta(id: string): ProviderMeta {
  return (
    PROVIDERS.find((provider) => provider.id === id) ?? {
      id,
      label: connectionLabels.get(id) ?? id,
      kind: "api-key",
      dotClass: "bg-muted-foreground",
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
