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
});
