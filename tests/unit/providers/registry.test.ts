import { describe, expect, it } from "vitest";

import { createProviderRegistry } from "../../../src/main/providers/registry";
import type { ProviderAdapter } from "../../../src/shared/types";

function fakeAdapter(id: string): ProviderAdapter {
  return {
    id,
    async listModels() {
      return [{ id: "fake-model", label: "Fake Model" }];
    },
    async validateCredential() {
      return true;
    },
    async *sendMessage() {
      yield { delta: "", done: true };
    },
  };
}

describe("createProviderRegistry", () => {
  it("looks up a registered adapter by id", () => {
    const registry = createProviderRegistry([fakeAdapter("openai"), fakeAdapter("anthropic")]);
    expect(registry.get("openai").id).toBe("openai");
    expect(registry.list().sort()).toEqual(["anthropic", "openai"]);
  });

  it("throws for an unknown provider id", () => {
    const registry = createProviderRegistry([fakeAdapter("openai")]);
    expect(() => registry.get("does-not-exist")).toThrow("Unknown provider: does-not-exist");
  });

  it("keeps the first adapter for an id, so a later one can't shadow it", () => {
    const registry = createProviderRegistry([
      { ...fakeAdapter("copilot-cli"), tag: "chat-or-agent" } as ProviderAdapter & { tag: string },
      { ...fakeAdapter("copilot-cli"), tag: "acp" } as ProviderAdapter & { tag: string },
      fakeAdapter("hermes"),
    ]);

    expect((registry.get("copilot-cli") as ProviderAdapter & { tag: string }).tag).toBe(
      "chat-or-agent",
    );
    expect(registry.list()).toEqual(["copilot-cli", "hermes"]);
  });

  it("falls back to adapters supplied at run time", () => {
    const registry = createProviderRegistry([], (id) =>
      id === "custom:1" ? fakeAdapter(id) : undefined,
    );

    expect(registry.get("custom:1").id).toBe("custom:1");
  });
});
