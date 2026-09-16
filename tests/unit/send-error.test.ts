import { describe, expect, it } from "vitest";

import { describeSendError } from "../../src/renderer/useHarness";

describe("describeSendError", () => {
  it("strips Electron's IPC wrapper so the pane shows the actual reason", () => {
    expect(
      describeSendError(
        new Error(
          "Error invoking remote method 'chat:send': Error: Claude Code isn't signed in. Run `claude` in a terminal to sign in.",
        ),
      ),
    ).toBe("Claude Code isn't signed in. Run `claude` in a terminal to sign in.");
  });

  it("leaves messages without the wrapper unchanged", () => {
    expect(describeSendError(new Error("Ollama isn't running."))).toBe("Ollama isn't running.");
    expect(describeSendError("plain string")).toBe("plain string");
  });
});
