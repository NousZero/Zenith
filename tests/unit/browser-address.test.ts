import { describe, expect, it } from "vitest";

import { addressToUrl, isAllowedPageUrl } from "../../src/shared/browser-address";

const search = (query: string) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

describe("addressToUrl", () => {
  it("loads addresses that carry an http or https scheme", () => {
    expect(addressToUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(addressToUrl("  http://127.0.0.1:8080  ")).toBe("http://127.0.0.1:8080/");
  });

  it("adds https:// to addresses without a scheme", () => {
    expect(addressToUrl("example.com")).toBe("https://example.com/");
    expect(addressToUrl("docs.example.co.uk/path#top")).toBe("https://docs.example.co.uk/path#top");
    expect(addressToUrl("localhost:3000")).toBe("https://localhost:3000/");
    expect(addressToUrl("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(addressToUrl("192.168.1.10")).toBe("https://192.168.1.10/");
    expect(addressToUrl("[::1]:5173")).toBe("https://[::1]:5173/");
  });

  it("searches DuckDuckGo for anything that is not an address", () => {
    expect(addressToUrl("how do closures work")).toBe(search("how do closures work"));
    expect(addressToUrl("typescript")).toBe(search("typescript"));
    expect(addressToUrl("define: zenith")).toBe(search("define: zenith"));
    expect(addressToUrl("c++")).toBe(search("c++"));
    expect(addressToUrl("someone@example.com")).toBe(search("someone@example.com"));
  });

  it("refuses schemes other than http and https", () => {
    expect(() => addressToUrl("javascript:alert(1)")).toThrow(/not javascript:/);
    expect(() => addressToUrl("file:///etc/passwd")).toThrow(/not file:/);
    expect(() => addressToUrl("mailto:someone@example.com")).toThrow(/not mailto:/);
    expect(() => addressToUrl("about:config")).toThrow(/not about:/);
  });

  it("allows about:blank and rejects empty input", () => {
    expect(addressToUrl("about:blank")).toBe("about:blank");
    expect(() => addressToUrl("   ")).toThrow(/Type an address/);
  });
});

describe("isAllowedPageUrl", () => {
  it("allows only http, https and about:blank", () => {
    expect(isAllowedPageUrl("https://example.com/")).toBe(true);
    expect(isAllowedPageUrl("http://localhost:3000/")).toBe(true);
    expect(isAllowedPageUrl("about:blank")).toBe(true);
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,hi",
      "about:config",
      "chrome://settings",
      "zenith-file://preview/x",
      "not a url",
    ]) {
      expect(isAllowedPageUrl(url)).toBe(false);
    }
  });
});
