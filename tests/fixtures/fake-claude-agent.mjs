#!/usr/bin/env node
// A stand-in for `claude -p --input-format stream-json --permission-prompt-tool stdio`.
// Proposes an edit to notes.txt, waits for Zenith's decision, then updates its todo list and replies.
// With FAKE_CLAUDE_STALL_MS set, it first logs a warning to stderr and says nothing for that long,
// like Claude Code waiting out a rate limit. It reports a session id, continues one named by
// --resume=<id>, appends its arguments and prompt to FAKE_CLAUDE_LOG, and with
// FAKE_CLAUDE_FAIL_RESUME set refuses to resume, like Claude Code whose session file is gone.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
if (process.env.FAKE_CLAUDE_ARGS_FILE) {
  writeFileSync(process.env.FAKE_CLAUDE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
}
const resume = process.argv
  .slice(2)
  .find((arg) => arg.startsWith("--resume="))
  ?.slice("--resume=".length);
if (resume && process.env.FAKE_CLAUDE_FAIL_RESUME) {
  process.stderr.write(`No conversation found with session ID: ${resume}\n`);
  process.exit(1);
}
const sessionId = resume ?? `fake-session-${process.pid}`;
const file = join(process.cwd(), "notes.txt");
const lines = createInterface({ input: process.stdin });
let step = "prompt";

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (step === "prompt" && message.type === "user") {
    step = "approval";
    if (process.env.FAKE_CLAUDE_LOG) {
      const { content } = message.message;
      const prompt =
        typeof content === "string" ? content : content.map((block) => block.text ?? "").join("");
      const entry = { args: process.argv.slice(2), prompt, sessionId };
      appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify(entry)}\n`);
    }
    const stall = Number(process.env.FAKE_CLAUDE_STALL_MS ?? 0);
    if (stall > 0) {
      process.stderr.write("[WARN] API rate limited (429); retrying in 30s\n");
      setTimeout(propose, stall);
    } else {
      propose();
    }
    return;
  }
  if (step === "approval" && message.type === "control_response") {
    step = "done";
    const allowed = message.response.response.behavior === "allow";
    if (allowed)
      writeFileSync(file, readFileSync(file, "utf8").replace("alpha\n", "alpha\nbeta\n"));
    out({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: allowed ? "updated" : message.response.response.message,
            is_error: !allowed,
          },
        ],
      },
    });
    const todos = [{ content: "Append beta", status: "completed", activeForm: "Appending" }];
    out({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "tool-2", name: "TodoWrite", input: { todos } }],
      },
    });
    out({
      type: "stream_event",
      event: { type: "content_block_start", content_block: { type: "text" } },
    });
    out({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: allowed ? "Edited." : "Could not edit." },
      },
    });
    out({
      type: "result",
      session_id: sessionId,
      is_error: false,
      usage: { input_tokens: 40, output_tokens: 8 },
      modelUsage: { m: { contextWindow: 200000 } },
    });
  }
});
lines.on("close", () => process.exit(0));

function propose() {
  out({ type: "system", subtype: "init", cwd: process.cwd(), session_id: sessionId });
  const input = {
    file_path: file,
    old_string: "alpha\n",
    new_string: "alpha\nbeta\n",
    replace_all: false,
  };
  out({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "tool-1", name: "Edit", input }] },
  });
  out({
    type: "control_request",
    request_id: "req-1",
    request: { subtype: "can_use_tool", tool_name: "Edit", input, tool_use_id: "tool-1" },
  });
}
