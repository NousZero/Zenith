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
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
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
