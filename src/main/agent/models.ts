import type { ImageAttachment, TokenUsage } from "../../shared/types";
import { anthropicContent, openAiContent } from "../providers/content";
import { asRecord } from "../cli/cli-adapter";
import { readSseLines } from "../providers/sse";
import type { ToolSpec } from "./tools";

export interface ToolCall {
  id: string;
  name: string;
  // Raw JSON text as the model produced it.
  arguments: string;
}

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string; images?: ImageAttachment[] }
  | { role: "assistant"; content: string; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ModelEvent =
  { delta: string } | { turn: { text: string; toolCalls: ToolCall[]; usage?: TokenUsage } };

// One tool-capable model call: streams text, then reports the finished turn.
export interface ToolModel {
  stream(
    model: string,
    messages: AgentMessage[],
    tools: readonly ToolSpec[],
    signal?: AbortSignal,
  ): AsyncIterable<ModelEvent>;
}

async function failure(label: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  if (/does not support tools|tool use is not supported|tools.*not supported/i.test(body)) {
    return new Error(
      `This ${label} model can't use tools, so it can't work in a project folder. Choose a model that supports tool calling.`,
    );
  }
  return new Error(`${label} request failed: ${response.status} ${body.slice(0, 500)}`.trim());
}

// OpenAI chat completions with function tools: OpenAI, OpenRouter, Ollama, and LM Studio.
export function openAiCompatibleModel(options: {
  label: string;
  baseUrl: string;
  headers(): Promise<Record<string, string>>;
}): ToolModel {
  return {
    async *stream(model, messages, tools, signal) {
      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await options.headers()) },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          // Some servers reject an empty tools list, so plain chats leave it out.
          ...(tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
              }
            : {}),
          messages: messages.map((message) => {
            if (message.role === "assistant") {
              return {
                role: "assistant",
                content: message.content || null,
                ...(message.toolCalls.length > 0
                  ? {
                      tool_calls: message.toolCalls.map((call) => ({
                        id: call.id,
                        type: "function",
                        function: { name: call.name, arguments: call.arguments },
                      })),
                    }
                  : {}),
              };
            }
            if (message.role === "tool") {
              return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
            }
            if (message.role === "user") {
              return { role: "user", content: openAiContent(message) };
            }
            return { role: message.role, content: message.content };
          }),
        }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw await failure(options.label, response);

      let text = "";
      let usage: TokenUsage | undefined;
      const calls = new Map<number, ToolCall>();
      for await (const payload of readSseLines(response, signal)) {
        if (payload === "[DONE]") break;
        let chunk: Record<string, unknown> | undefined;
        try {
          chunk = asRecord(JSON.parse(payload));
        } catch {
          continue;
        }
        const reported = asRecord(chunk?.["usage"]);
        if (reported) {
          usage = {
            inputTokens: Number(reported["prompt_tokens"]) || 0,
            outputTokens: Number(reported["completion_tokens"]) || 0,
          };
        }
        const choices = chunk?.["choices"];
        const delta = asRecord(
          asRecord(Array.isArray(choices) ? choices[0] : undefined)?.["delta"],
        );
        const content = delta?.["content"];
        if (typeof content === "string" && content !== "") {
          text += content;
          yield { delta: content };
        }
        for (const item of Array.isArray(delta?.["tool_calls"]) ? delta["tool_calls"] : []) {
          const part = asRecord(item);
          const index = Number(part?.["index"]) || 0;
          const fn = asRecord(part?.["function"]);
          const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
          if (typeof part?.["id"] === "string") call.id = part["id"];
          if (typeof fn?.["name"] === "string") call.name += fn["name"];
          if (typeof fn?.["arguments"] === "string") call.arguments += fn["arguments"];
          calls.set(index, call);
        }
      }
      const toolCalls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }))
        .filter((call) => call.name !== "");
      yield { turn: { text, toolCalls, ...(usage ? { usage } : {}) } };
    },
  };
}

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MAX_TOKENS = 8_192;

export function anthropicModel(options: {
  apiKey(): Promise<string>;
  baseUrl?: string;
}): ToolModel {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
  return {
    async *stream(model, messages, tools, signal) {
      const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
      const conversation: { role: "user" | "assistant"; content: unknown[] }[] = [];
      const push = (role: "user" | "assistant", block: unknown) => {
        const last = conversation.at(-1);
        if (last?.role === role) last.content.push(block);
        else conversation.push({ role, content: [block] });
      };
      for (const message of messages) {
        if (message.role === "system") continue;
        if (message.role === "user") {
          const content = anthropicContent(message);
          for (const block of typeof content === "string"
            ? [{ type: "text", text: content }]
            : content) {
            push("user", block);
          }
        }
        if (message.role === "assistant") {
          if (message.content) push("assistant", { type: "text", text: message.content });
          for (const call of message.toolCalls) {
            let input: unknown;
            try {
              input = JSON.parse(call.arguments || "{}");
            } catch {
              input = {};
            }
            push("assistant", { type: "tool_use", id: call.id, name: call.name, input });
          }
        }
        if (message.role === "tool") {
          push("user", {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content,
          });
        }
      }

      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": await options.apiKey(),
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          stream: true,
          ...(system ? { system } : {}),
          ...(tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.parameters,
                })),
              }
            : {}),
          messages: conversation,
        }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw await failure("Anthropic", response);

      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      const blocks = new Map<number, ToolCall>();
      for await (const payload of readSseLines(response, signal)) {
        let event: Record<string, unknown> | undefined;
        try {
          event = asRecord(JSON.parse(payload));
        } catch {
          continue;
        }
        const type = event?.["type"];
        const index = Number(event?.["index"]) || 0;
        if (type === "message_start") {
          const usage = asRecord(asRecord(event?.["message"])?.["usage"]);
          inputTokens =
            (Number(usage?.["input_tokens"]) || 0) +
            (Number(usage?.["cache_read_input_tokens"]) || 0) +
            (Number(usage?.["cache_creation_input_tokens"]) || 0);
        } else if (type === "content_block_start") {
          const block = asRecord(event?.["content_block"]);
          if (block?.["type"] === "tool_use") {
            blocks.set(index, {
              id: String(block["id"]),
              name: String(block["name"]),
              arguments: "",
            });
          }
        } else if (type === "content_block_delta") {
          const delta = asRecord(event?.["delta"]);
          if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
            text += delta["text"];
            yield { delta: delta["text"] };
          } else if (delta?.["type"] === "input_json_delta") {
            const call = blocks.get(index);
            if (call) call.arguments += String(delta["partial_json"] ?? "");
          }
        } else if (type === "message_delta") {
          outputTokens = Number(asRecord(event?.["usage"])?.["output_tokens"]) || outputTokens;
        } else if (type === "error") {
          throw new Error(
            `Anthropic error: ${String(asRecord(event?.["error"])?.["message"] ?? "unknown")}`,
          );
        }
      }
      yield {
        turn: {
          text,
          toolCalls: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, call]) => call),
          usage: { inputTokens, outputTokens },
        },
      };
    },
  };
}
