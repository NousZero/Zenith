import { readFile, writeFile } from "node:fs/promises";

import {
  normalizeBaseUrl,
  slugify,
  type CustomProvider,
  type CustomProviderInput,
} from "../shared/custom-providers";
import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../shared/types";
import { anthropicModel, openAiCompatibleModel, type ToolModel } from "./agent/models";
import type { CredentialStore } from "./credential-store";

type Stored = Omit<CustomProvider, "hasKey">;

function isStored(value: unknown): value is Stored {
  const item = value as Partial<Stored> | null;
  return (
    typeof item?.id === "string" &&
    item.id.startsWith("custom:") &&
    typeof item.name === "string" &&
    (item.api === "openai" || item.api === "anthropic") &&
    typeof item.baseUrl === "string" &&
    Array.isArray(item.models) &&
    item.models.every((model) => typeof model === "string")
  );
}

// The provider's tool-capable model client, used for chats and for Zenith's own agent.
export function customModel(provider: Stored, credentials: CredentialStore): ToolModel {
  const key = async () => (await credentials.get(provider.id)) ?? "";
  return provider.api === "anthropic"
    ? anthropicModel({ apiKey: key, baseUrl: provider.baseUrl })
    : openAiCompatibleModel({
        label: provider.name,
        baseUrl: provider.baseUrl,
        headers: async () => {
          const apiKey = await key();
          return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        },
      });
}

export function customAdapter(provider: Stored, credentials: CredentialStore): ProviderAdapter {
  const model = customModel(provider, credentials);
  const key = async () => (await credentials.get(provider.id)) ?? "";
  return {
    id: provider.id,
    async listModels(): Promise<Model[]> {
      if (provider.models.length > 0) return provider.models.map((id) => ({ id, label: id }));
      const apiKey = await key();
      const response = await fetch(`${provider.baseUrl}/models`, {
        headers:
          provider.api === "anthropic"
            ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
            : apiKey
              ? { Authorization: `Bearer ${apiKey}` }
              : {},
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `${provider.name} model list failed (${response.status}). Add model IDs in Settings → Providers.`,
        );
      }
      const body = (await response.json()) as { data?: { id?: unknown }[] };
      return (body.data ?? [])
        .flatMap((item) => (typeof item.id === "string" ? [{ id: item.id, label: item.id }] : []))
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    async validateCredential(): Promise<boolean> {
      return true;
    },
    async *sendMessage(request: SendMessageRequest): AsyncIterable<ChatChunk> {
      for await (const event of model.stream(
        request.model,
        request.messages.map((message) =>
          message.role === "assistant"
            ? { role: "assistant" as const, content: message.content, toolCalls: [] }
            : { role: message.role, content: message.content },
        ),
        [],
        request.signal,
      )) {
        if ("delta" in event) {
          yield { delta: event.delta, done: false };
        } else {
          yield { delta: "", done: true, ...(event.turn.usage ? { usage: event.turn.usage } : {}) };
        }
      }
    },
  };
}

export function createCustomProviderStore(filePath: string, credentials: CredentialStore) {
  async function readStored(): Promise<Stored[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
      return Array.isArray(parsed) ? parsed.filter(isStored) : [];
    } catch {
      return [];
    }
  }

  async function list(): Promise<CustomProvider[]> {
    const [stored, keys] = await Promise.all([readStored(), credentials.list()]);
    return stored.map((provider) => ({ ...provider, hasKey: keys.includes(provider.id) }));
  }

  return {
    list,
    readStored,

    async save(input: CustomProviderInput): Promise<CustomProvider[]> {
      const name = input.name.trim();
      if (!name) throw new Error("Give the provider a name.");
      if (input.api !== "openai" && input.api !== "anthropic") throw new Error("Unknown API type.");
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      const models = [...new Set(input.models.map((model) => model.trim()).filter(Boolean))];
      const stored = await readStored();
      let id = input.id;
      if (id && !stored.some((provider) => provider.id === id))
        throw new Error("That provider no longer exists.");
      if (!id) {
        const base = `custom:${slugify(name)}`;
        id = base;
        for (let n = 2; stored.some((provider) => provider.id === id); n++) id = `${base}-${n}`;
      }
      const next: Stored = { id, name, api: input.api, baseUrl, models };
      await writeFile(
        filePath,
        JSON.stringify(
          stored.some((provider) => provider.id === id)
            ? stored.map((provider) => (provider.id === id ? next : provider))
            : [...stored, next],
          null,
          2,
        ),
        "utf8",
      );
      if (input.apiKey === null) await credentials.delete(id);
      else if (input.apiKey.trim()) await credentials.set(id, input.apiKey.trim());
      return list();
    },

    async remove(id: string): Promise<CustomProvider[]> {
      const stored = await readStored();
      await writeFile(
        filePath,
        JSON.stringify(
          stored.filter((provider) => provider.id !== id),
          null,
          2,
        ),
        "utf8",
      );
      await credentials.delete(id);
      return list();
    },
  };
}
