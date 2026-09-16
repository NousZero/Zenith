import { describe, expect, it } from "vitest";

import { normalizeBaseUrl, slugify } from "../../src/shared/custom-providers";

describe("custom provider input", () => {
  it("normalizes base URLs and refuses unsafe ones", () => {
    expect(normalizeBaseUrl(" https://api.groq.com/openai/v1/ ")).toBe(
      "https://api.groq.com/openai/v1",
    );
    expect(normalizeBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
    expect(normalizeBaseUrl("http://192.168.1.20:8080/v1")).toBe("http://192.168.1.20:8080/v1");
    expect(() => normalizeBaseUrl("http://api.example.com/v1")).toThrow("https://");
    expect(() => normalizeBaseUrl("ftp://example.com")).toThrow("https:// or http://");
    expect(() => normalizeBaseUrl("api.example.com")).toThrow("full address");
    expect(() => normalizeBaseUrl("https://user:secret@api.example.com")).toThrow("key field");
  });

  it("makes provider slugs", () => {
    expect(slugify("Together AI")).toBe("together-ai");
    expect(slugify("!!!")).toBe("provider");
  });
});
