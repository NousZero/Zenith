import { describe, expect, it } from "vitest";

import { stallNotice, withStallNotices } from "../../src/main/cli/stall-notice";

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

describe("stall notices between an agent's output", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("slips in each new warning after a quiet spell, once, without losing output", async () => {
    let warning: string | undefined;
    async function* output() {
      warning = "first";
      await sleep(100);
      yield "a";
      warning = "second";
      await sleep(100);
      yield "b";
      // Quiet again with nothing new to say, so nothing more is shown.
      await sleep(100);
      yield "c";
    }
    const seen: unknown[] = [];
    for await (const item of withStallNotices(output(), () => warning, 20)) seen.push(item);
    expect(seen).toEqual([{ notice: "first" }, "a", { notice: "second" }, "b", "c"]);
  });

  it("says nothing when the agent keeps talking or has no warning", async () => {
    async function* output() {
      yield "a";
      await sleep(60);
      yield "b";
    }
    const seen: unknown[] = [];
    for await (const item of withStallNotices(output(), () => undefined, 20)) seen.push(item);
    expect(seen).toEqual(["a", "b"]);
  });
});
