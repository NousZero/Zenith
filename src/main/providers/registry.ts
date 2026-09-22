import type { ProviderAdapter } from "../../shared/types";

export interface ProviderRegistry {
  get(id: string): ProviderAdapter;
  list(): string[];
}

// `extra` supplies adapters that can change at run time, such as user-defined providers.
export function createProviderRegistry(
  adapters: ProviderAdapter[],
  extra: (id: string) => ProviderAdapter | undefined = () => undefined,
): ProviderRegistry {
  // The first adapter registered for an id wins. Gemini CLI and Copilot CLI are registered once
  // as chat-or-agent wrappers and once as plain ACP agents; last-wins sent their plain chat
  // through ACP, which fails without a project folder.
  const byId = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    if (!byId.has(adapter.id)) byId.set(adapter.id, adapter);
  }
  return {
    get(id: string): ProviderAdapter {
      const adapter = byId.get(id) ?? extra(id);
      if (!adapter) throw new Error(`Unknown provider: ${id}`);
      return adapter;
    },
    list(): string[] {
      return [...byId.keys()];
    },
  };
}
