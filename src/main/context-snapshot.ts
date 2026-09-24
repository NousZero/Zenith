import { estimateTokens } from "../shared/tokens";
import type { ChatMessage, ContextSnapshot } from "../shared/types";
import { agentTools, projectContext } from "./agent/claude-agent";
import { agentPrompt, nativeToolNames } from "./agent/native-agent";
import { TOOL_SPECS } from "./agent/tools";

// Connections whose own instructions Zenith can't see.
const OWN_INSTRUCTIONS: Record<string, string> = {
  "claude-code":
    "Claude Code adds its own built-in instructions and tool definitions, which Zenith can't see. For a plain chat they are about 540–720 tokens.",
  "gemini-cli": "Gemini CLI adds its own built-in instructions, which Zenith can't see.",
  "copilot-cli": "Copilot CLI adds its own built-in instructions, which Zenith can't see.",
  hermes: "Hermes Agent adds its own instructions, memory, and tools, which Zenith can't see.",
  opencode: "OpenCode adds its own instructions and tools, which Zenith can't see.",
};

// Connections that run Zenith's own agent loop when given a project folder.
function runsNativeAgent(providerId: string): boolean {
  return !(providerId in OWN_INSTRUCTIONS);
}

function section(label: string, text: string) {
  return { label, text, tokens: estimateTokens(text) };
}

// What a request carries to the model, assembled the same way the connections assemble it, so the
// window can show it. Parts the connection adds itself are named in `note`.
export async function describeContext(input: {
  providerId: string;
  modelId: string;
  messages: ChatMessage[];
  projectPath?: string | undefined;
  planMode?: boolean | undefined;
  allowedTools?: string[] | undefined;
  // The agent continued its own session, which already holds everything but the newest message.
  resumed?: boolean;
}): Promise<ContextSnapshot> {
  const sections: ContextSnapshot["sections"] = [];
  const toolOptions = {
    ...(input.planMode ? { planMode: true } : {}),
    ...(input.allowedTools ? { allowedTools: input.allowedTools } : {}),
  };
  const system = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = input.messages.filter((message) => message.role !== "system");
  const latest = conversation.at(-1);
  const history = conversation.slice(0, -1);

  if (input.projectPath && runsNativeAgent(input.providerId)) {
    sections.push(section("Zenith's agent instructions", agentPrompt(input.projectPath, false)));
  }
  if (system) {
    sections.push(section("Soul, profile, role, memory, agent, and plan instructions", system));
  }
  if (input.projectPath) {
    const files = await projectContext(input.projectPath);
    if (files) sections.push(section("Project instructions (AGENTS.md, CLAUDE.md)", files));
    if (runsNativeAgent(input.providerId)) {
      const names = new Set(nativeToolNames(toolOptions));
      const specs = TOOL_SPECS.filter((tool) => names.has(tool.name));
      sections.push(section(`Tool definitions (${specs.length})`, JSON.stringify(specs, null, 2)));
    } else if (input.providerId === "claude-code") {
      sections.push(section("Tools allowed", agentTools(toolOptions).join(", ")));
    }
  }
  if (history.length > 0) {
    sections.push(
      section(
        `Earlier conversation (${history.length} messages)`,
        history.map((message) => `${message.role}: ${message.content}`).join("\n\n"),
      ),
    );
  }
  if (latest) {
    const count = latest.images?.length ?? 0;
    sections.push(
      section(
        count > 0
          ? `Latest message, with ${count} ${count === 1 ? "image" : "images"} (not counted)`
          : "Latest message",
        latest.content,
      ),
    );
  }

  if (input.resumed) {
    // The latest message is always the last section.
    const sent = sections.slice(-1);
    return {
      at: Date.now(),
      providerId: input.providerId,
      modelId: input.modelId,
      sections: sent,
      totalTokens: sent.reduce((sum, item) => sum + item.tokens, 0),
      note: "This turn continued the agent's own session, so Zenith sent only the newest message. The agent already holds the instructions and earlier conversation from previous turns, and its token counts include them.",
    };
  }

  const note = [
    OWN_INSTRUCTIONS[input.providerId] ?? "",
    input.projectPath && runsNativeAgent(input.providerId)
      ? "Tools from MCP servers are added on top, if any are configured."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    at: Date.now(),
    providerId: input.providerId,
    modelId: input.modelId,
    sections,
    totalTokens: sections.reduce((sum, item) => sum + item.tokens, 0),
    ...(note ? { note } : {}),
  };
}
