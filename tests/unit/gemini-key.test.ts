import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { geminiKeyEnv, geminiSignIn } from "../../src/main/cli/gemini-key";

describe("Gemini API key from ~/.gemini/.env", () => {
  let home: string | undefined;
  afterEach(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  function withEnvFile(text: string): string {
    home = mkdtempSync(join(tmpdir(), "zenith-gemini-home-"));
    mkdirSync(join(home, ".gemini"));
    writeFileSync(join(home, ".gemini", ".env"), text);
    return home;
  }

  it("reads the key, with or without export and quotes", () => {
    expect(geminiKeyEnv(withEnvFile("# comment\nGEMINI_API_KEY=abc123\n"), {})).toEqual({
      GEMINI_API_KEY: "abc123",
    });
    rmSync(home ?? "", { recursive: true, force: true });
    expect(geminiKeyEnv(withEnvFile('export GOOGLE_API_KEY="xyz"\r\n'), {})).toEqual({
      GOOGLE_API_KEY: "xyz",
    });
  });

  it("leaves an existing key alone, and has nothing to add without a file", () => {
    expect(geminiKeyEnv(withEnvFile("GEMINI_API_KEY=file\n"), { GEMINI_API_KEY: "set" })).toEqual(
      {},
    );
    expect(geminiKeyEnv(join(tmpdir(), "zenith-no-such-home"), {})).toEqual({});
  });

  it("signs in with the key only when one is present", () => {
    expect(geminiSignIn({ GEMINI_API_KEY: "k" })).toBe("gemini-api-key");
    expect(geminiSignIn({})).toBeUndefined();
  });
});
