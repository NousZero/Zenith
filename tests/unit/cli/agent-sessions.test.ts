import { describe, expect, it } from "vitest";

import { createAgentSessions, resumeOrReplay } from "../../../src/main/cli/agent-sessions";
import type { ChatChunk } from "../../../src/shared/types";

const pane = { model: "default", messages: [], conversationId: "pane-1" };

describe("createAgentSessions", () => {
  it("continues a kept session only for the turn the window names, with the same setup", () => {
    const sessions = createAgentSessions();
    sessions.keep({ ...pane, turnId: "t1" }, "setup", "s1");
    expect(sessions.take({ ...pane, turnId: "t2", resumeFrom: "t1" }, "setup")).toBe("s1");

    sessions.keep({ ...pane, turnId: "t2" }, "setup", "s1");
    expect(sessions.take({ ...pane, turnId: "t3", resumeFrom: "t1" }, "setup")).toBeUndefined();

    sessions.keep({ ...pane, turnId: "t3" }, "setup", "s1");
    expect(sessions.take({ ...pane, turnId: "t4", resumeFrom: "t3" }, "other")).toBeUndefined();
  });

  it("forgets a session once any other turn starts", () => {
    const sessions = createAgentSessions();
    sessions.keep({ ...pane, turnId: "t1" }, "setup", "s1");
    expect(sessions.take({ ...pane, turnId: "t2" }, "setup")).toBeUndefined();
    // The failed or unnamed turn can't be followed by a resume of the older one.
    expect(sessions.take({ ...pane, turnId: "t3", resumeFrom: "t1" }, "setup")).toBeUndefined();
  });

  it("keeps nothing for requests without a pane", () => {
    const sessions = createAgentSessions();
    expect(sessions.tracks({ model: "m", messages: [], turnId: "t1" })).toBe(false);
    sessions.keep({ model: "m", messages: [], turnId: "t1" }, "setup", "s1");
    expect(sessions.tracks({ ...pane, turnId: "t1" })).toBe(true);
  });
});

async function collect(iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

async function* chunks(...items: (ChatChunk | Error)[]): AsyncIterable<ChatChunk> {
  for (const item of items) {
    if (item instanceof Error) throw item;
    yield item;
  }
}

describe("resumeOrReplay", () => {
  const replay = () => chunks({ delta: "full", done: false }, { delta: "", done: true });

  it("replays with the whole transcript when resuming fails before any output", async () => {
    const notice: ChatChunk = { delta: "", done: false, notice: "waiting" };
    const result = await collect(
      resumeOrReplay(() => chunks(notice, new Error("session gone")), replay),
    );
    expect(result.map((chunk) => chunk.delta).join("")).toBe("full");
  });

  it("reports the failure once the resumed turn has shown something", async () => {
    await expect(
      collect(
        resumeOrReplay(() => chunks({ delta: "par", done: false }, new Error("broke")), replay),
      ),
    ).rejects.toThrow("broke");
  });

  it("does not replay a turn the user stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(resumeOrReplay(() => chunks(new Error("aborted")), replay, controller.signal)),
    ).rejects.toThrow("aborted");
  });
});
