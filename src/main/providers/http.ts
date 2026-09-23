import { normalizeBaseUrl } from "../../shared/custom-providers";

// From Agamemnon's provider connection policy, the two rules that stop a key going astray.
// Redirects are refused: fetch drops Authorization on a cross-site redirect but not x-api-key,
// so a redirect could hand an Anthropic-style key to another host. And every request, not just
// the saved settings, must be https unless it stays on this computer or the local network.
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  normalizeBaseUrl(new URL(url).origin);
  try {
    return await fetch(url, { ...init, redirect: "error" });
  } catch (error: unknown) {
    if (error instanceof TypeError && /redirect/i.test(String(error.cause ?? error.message))) {
      throw new Error(
        `${new URL(url).host} answered with a redirect; Zenith does not follow them.`,
        { cause: error },
      );
    }
    throw error;
  }
}
