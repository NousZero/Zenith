import { normalizeBaseUrl } from "../../shared/custom-providers";

// Shared with the bot transports: fetch drops Authorization on a cross-site redirect but keeps
// other auth (a custom header, a token in the URL path), so a redirect could hand it to another
// host. Refusing to follow one is the one rule every outbound request in Zenith needs.
export async function noRedirectFetch(url: string, init: RequestInit = {}): Promise<Response> {
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

// Model providers additionally require https unless the address stays on this computer or the
// local network, since these are user-entered API base URLs rather than fixed platform hosts.
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  normalizeBaseUrl(new URL(url).origin);
  return noRedirectFetch(url, init);
}
