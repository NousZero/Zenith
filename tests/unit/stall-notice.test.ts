import { describe, expect, it } from "vitest";

import { stallNotice } from "../../src/main/acp/connection";

describe("stall notices from an agent's stderr", () => {
  it("shows the latest warning without its timestamp, level, and logger prefix", () => {
    const stderr = [
      "2026-09-24 09:10:03 [INFO] run_agent: OpenAI client created (chat_completion_stream_request)",
      "2026-09-24 09:10:04 [ERROR] agent.chat_completion_helpers: Streaming failed before delivery: quota exceeded",
      "2026-09-24 09:10:04 [WARNING] agent.conversation_loop: Retrying API call in 600s (attempt 1/3) thread=acp-agent_0",
      "2026-09-24 09:10:05 [INFO] run_agent: waiting",
    ].join("\n");
    expect(stallNotice(stderr)).toBe("Retrying API call in 600s (attempt 1/3) thread=acp-agent_0");
  });

  it("ignores ordinary progress logging", () => {
    expect(stallNotice("[INFO] loaded config\n[INFO] session started\n")).toBeUndefined();
    expect(stallNotice("")).toBeUndefined();
  });

  it("keeps a plain warning and shortens a very long one", () => {
    expect(stallNotice("⚠ Auxiliary title generation failed: HTTP 429: quota exceeded")).toBe(
      "Auxiliary title generation failed: HTTP 429: quota exceeded",
    );
    expect(stallNotice(`Error: ${"x".repeat(400)}`)?.length).toBe(200);
  });
});
