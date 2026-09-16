#!/usr/bin/env node
// A stand-in for `claude -p --input-format stream-json --permission-prompt-tool stdio`.
// Proposes an edit to notes.txt, waits for Zenith's decision, then updates its todo list and replies.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const file = join(process.cwd(), "notes.txt");
const lines = createInterface({ input: process.stdin });
let step = "prompt";

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (step === "prompt" && message.type === "user") {
    step = "approval";
    out({ type: "system", subtype: "init", cwd: process.cwd() });
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
      is_error: false,
      usage: { input_tokens: 40, output_tokens: 8 },
      modelUsage: { m: { contextWindow: 200000 } },
    });
  }
});
lines.on("close", () => process.exit(0));
