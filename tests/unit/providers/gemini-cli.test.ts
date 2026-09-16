import { describe, expect, it } from "vitest";

import {
  geminiCliSpec,
  innermostErrorMessage,
  parseGeminiLine,
} from "../../../src/main/providers/gemini-cli";

// Error payload captured from Gemini CLI 0.44.1 run with an invalid API key.
const NESTED_API_ERROR =
  '[API Error: {"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 400,\\n    \\"message\\": \\"API key not valid. Please pass a valid API key.\\",\\n    \\"status\\": \\"INVALID_ARGUMENT\\"\\n  }\\n}\\n","code":400,"status":""}}]';

describe("parseGeminiLine", () => {
  it("extracts assistant deltas and ignores the echoed user message", () => {
    expect(
      parseGeminiLine('{"type":"message","role":"assistant","content":"pong","delta":true}'),
    ).toEqual({ delta: "pong" });
    expect(parseGeminiLine('{"type":"message","role":"user","content":"hi"}')).toBeUndefined();
  });

  it("reads usage from a successful result", () => {
    expect(
      parseGeminiLine(
        '{"type":"result","status":"success","stats":{"total_tokens":30,"input_tokens":24,"output_tokens":6}}',
      ),
    ).toEqual({ usage: { inputTokens: 24, outputTokens: 6 } });
  });

  it("turns an invalid-key result into sign-in guidance", () => {
    const line = JSON.stringify({
      type: "result",
      status: "error",
      error: { type: "unknown", message: NESTED_API_ERROR },
      stats: { input_tokens: 0, output_tokens: 0 },
    });
    expect(parseGeminiLine(line)?.error).toBe(
      "Gemini CLI isn't signed in. Run `gemini` in a terminal once to sign in.",
    );
  });

  it("surfaces error-severity events but not warnings", () => {
    expect(
      parseGeminiLine('{"type":"error","severity":"error","message":"Quota exhausted"}'),
    ).toEqual({ error: "Quota exhausted" });
    expect(
      parseGeminiLine('{"type":"error","severity":"warning","message":"slow"}'),
    ).toBeUndefined();
  });
});

describe("innermostErrorMessage", () => {
  it("digs the human message out of the nested API error string", () => {
    expect(innermostErrorMessage(NESTED_API_ERROR)).toBe(
      "API key not valid. Please pass a valid API key.",
    );
  });

  it("returns plain messages unchanged", () => {
    expect(innermostErrorMessage("Something failed")).toBe("Something failed");
  });
});

describe("geminiCliSpec", () => {
  it("runs headless in read-only plan mode with the prompt on stdin", () => {
    const { args, stdin } = geminiCliSpec.buildInvocation("flash", {
      system: "Be brief.",
      prompt: "- starts with a dash",
    });
    expect(args).toEqual([
      "-p",
      " ",
      "-o",
      "stream-json",
      "--approval-mode",
      "plan",
      "--skip-trust",
      "-m",
      "flash",
    ]);
    expect(stdin).toBe("Follow these instructions:\nBe brief.\n\n- starts with a dash");
  });

  it("explains exit code 41 as a missing sign-in", () => {
    expect(geminiCliSpec.describeFailure({ exitCode: 41, stderr: "", aborted: false })).toBe(
      "Gemini CLI isn't signed in. Run `gemini` in a terminal once to sign in.",
    );
  });
});
