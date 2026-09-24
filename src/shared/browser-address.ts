// What the built-in browser does with the text typed into its address field.

export const SEARCH_URL = "https://duckduckgo.com/?q=";

const SCHEME = /^([a-z][a-z\d+.-]*):/i;
// Hosts worth trying as an address: localhost, an IP address, or a name ending in a real-looking
// top-level domain (letters, or the punycode form of a non-Latin one).
const HOST =
  /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\]|.+\.(?:[a-z]{2,}|xn--[a-z\d-]+))$/i;

// The only pages the browser loads. Everything else a page or the address field asks for, such as
// file:, javascript: or another app's scheme, is refused.
export function isAllowedPageUrl(url: string): boolean {
  if (url === "about:blank") return true;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Turns address-field text into the URL to load: an address, with https:// added when it has no
// scheme, or otherwise a DuckDuckGo search. Throws for an address in a scheme the browser refuses.
export function addressToUrl(input: string): string {
  const text = input.trim();
  if (!text) throw new Error("Type an address or something to search for.");
  const search = `${SEARCH_URL}${encodeURIComponent(text)}`;
  if (/\s/.test(text)) return search;

  const scheme = SCHEME.exec(text)?.[1];
  // "localhost:3000" and "example.com:8080" start like a scheme but are a host and a port.
  if (scheme && !/^\d+(?:[/?#]|$)/.test(text.slice(scheme.length + 1))) {
    if (!isAllowedPageUrl(text)) {
      throw new Error(`Only http and https pages can be opened, not ${scheme.toLowerCase()}:`);
    }
    return text === "about:blank" ? text : new URL(text).href;
  }

  try {
    const url = new URL(`https://${text}`);
    // "someone@example.com" would otherwise sign in to example.com as "someone".
    if (!url.username && !url.password && HOST.test(url.hostname)) return url.href;
  } catch {
    // Not an address, so it is a search.
  }
  return search;
}
