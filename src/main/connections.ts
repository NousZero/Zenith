import type { ConnectionStatus, Model } from "../shared/types";

export interface ConnectionProbes {
  resolveBinary(name: string): Promise<string | undefined>;
  runCommand(
    binaryPath: string,
    args: string[],
  ): Promise<{ stdout: string; exitCode: number | null }>;
  fetchLocalModels(baseUrl: string): Promise<Model[]>;
  fileExists(path: string): Promise<boolean>;
  readJsonFile(path: string): Promise<unknown>;
  env: NodeJS.ProcessEnv;
  home: string;
  join(...segments: string[]): string;
}

export const LOCAL_SERVERS = [
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434",
    startHint: "Open the Ollama app or run `ollama serve`.",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234",
    startHint: "Start the local server in LM Studio's Developer tab.",
  },
] as const;

const API_KEY_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
] as const;

export const CLI_BINARIES = {
  "claude-code": "claude",
  "gemini-cli": "gemini",
  "copilot-cli": "copilot",
  hermes: "hermes",
  opencode: "opencode",
} as const;

export const AGENTS = [
  { id: "hermes", label: "Hermes Agent" },
  { id: "opencode", label: "OpenCode" },
] as const;

function versionOf(output: string): string {
  return /\d+\.\d+\.\d+/.exec(output)?.[0] ?? "";
}

function withVersion(label: string, version: string): string {
  return version ? `${label} ${version}` : label;
}

async function detectClaudeCode(probes: ConnectionProbes): Promise<ConnectionStatus> {
  const base = { id: "claude-code", label: "Claude Code", kind: "cli" as const };
  const binary = await probes.resolveBinary(CLI_BINARIES["claude-code"]);
  if (!binary) return { ...base, state: "not-installed", detail: "Not installed" };

  const [version, auth] = await Promise.all([
    probes.runCommand(binary, ["--version"]),
    probes.runCommand(binary, ["auth", "status"]),
  ]);
  const name = withVersion("Claude Code", versionOf(version.stdout));
  try {
    const status = JSON.parse(auth.stdout) as { loggedIn?: unknown };
    if (status.loggedIn === false) {
      return {
        ...base,
        state: "sign-in-required",
        detail: `${name} · run \`claude\` in a terminal to sign in`,
      };
    }
  } catch {
    // Older builds without `auth status`: sign-in problems surface when a message is sent.
  }
  return { ...base, state: "ready", detail: `${name} · signed in` };
}

async function geminiSignedIn(probes: ConnectionProbes): Promise<boolean> {
  const envKeys = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_GENAI_USE_GCA",
  ];
  if (envKeys.some((key) => (probes.env[key] ?? "") !== "")) return true;
  const settingsPath = probes.join(probes.home, ".gemini", "settings.json");
  if (await probes.fileExists(settingsPath)) {
    const settings = (await probes.readJsonFile(settingsPath).catch(() => undefined)) as
      { selectedAuthType?: unknown; security?: { auth?: { selectedType?: unknown } } } | undefined;
    if (settings?.selectedAuthType || settings?.security?.auth?.selectedType) return true;
  }
  // Existence only — the credential file itself is never read.
  return probes.fileExists(probes.join(probes.home, ".gemini", "oauth_creds.json"));
}

async function detectGeminiCli(probes: ConnectionProbes): Promise<ConnectionStatus> {
  const base = { id: "gemini-cli", label: "Gemini CLI", kind: "cli" as const };
  const binary = await probes.resolveBinary(CLI_BINARIES["gemini-cli"]);
  if (!binary) return { ...base, state: "not-installed", detail: "Not installed" };
  const [version, signedIn] = await Promise.all([
    probes.runCommand(binary, ["--version"]),
    geminiSignedIn(probes),
  ]);
  const name = withVersion("Gemini CLI", versionOf(version.stdout));
  return signedIn
    ? { ...base, state: "ready", detail: `${name} · signed in` }
    : {
        ...base,
        state: "sign-in-required",
        detail: `${name} · run \`gemini\` in a terminal to sign in`,
      };
}

async function detectCopilotCli(probes: ConnectionProbes): Promise<ConnectionStatus> {
  const base = { id: "copilot-cli", label: "Copilot CLI", kind: "cli" as const };
  const binary = await probes.resolveBinary(CLI_BINARIES["copilot-cli"]);
  if (!binary) return { ...base, state: "not-installed", detail: "Not installed" };
  const version = await probes.runCommand(binary, ["--version"]);
  const name = withVersion("Copilot CLI", versionOf(version.stdout));
  // Plan and organization policy can only be checked by sending a request.
  return { ...base, state: "ready", detail: `${name} · plan access is checked when you send` };
}

// Agents are full coding agents with their own tools; sign-in problems surface when you send.
async function detectAgent(
  probes: ConnectionProbes,
  agent: (typeof AGENTS)[number],
): Promise<ConnectionStatus> {
  const base = { id: agent.id, label: agent.label, kind: "agent" as const };
  const binary = await probes.resolveBinary(CLI_BINARIES[agent.id]);
  if (!binary) return { ...base, state: "not-installed", detail: "Not installed" };
  const version = await probes.runCommand(binary, ["--version"]);
  const name = withVersion(agent.label, versionOf(version.stdout));
  return {
    ...base,
    state: "ready",
    detail: `${name} · agent with its own tools, asks before risky actions`,
  };
}

async function detectLocalServer(
  probes: ConnectionProbes,
  server: (typeof LOCAL_SERVERS)[number],
): Promise<ConnectionStatus> {
  const base = { id: server.id, label: server.label, kind: "local" as const };
  try {
    const models = await probes.fetchLocalModels(server.baseUrl);
    const count = `${models.length} ${models.length === 1 ? "model" : "models"}`;
    return { ...base, state: "ready", detail: `Running · ${count}` };
  } catch {
    return { ...base, state: "not-running", detail: `Not running · ${server.startHint}` };
  }
}

export async function detectToolConnections(probes: ConnectionProbes): Promise<ConnectionStatus[]> {
  const [cli, agents, local] = await Promise.all([
    Promise.all([detectClaudeCode(probes), detectGeminiCli(probes), detectCopilotCli(probes)]),
    Promise.all(AGENTS.map((agent) => detectAgent(probes, agent))),
    Promise.all(LOCAL_SERVERS.map((server) => detectLocalServer(probes, server))),
  ]);
  return [...cli, ...agents, ...local];
}

export function apiKeyConnections(savedCredentialIds: string[]): ConnectionStatus[] {
  return API_KEY_PROVIDERS.map((provider) => {
    const saved = savedCredentialIds.includes(provider.id);
    return {
      ...provider,
      kind: "api-key",
      state: saved ? "ready" : "needs-key",
      detail: saved ? "API key saved" : "Add an API key",
    };
  });
}
