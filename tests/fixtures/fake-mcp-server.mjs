#!/usr/bin/env node
// A stand-in MCP server over stdio with one "shout" tool and one tool that always fails.
import { createInterface } from "node:readline";

const out = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    out({ id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } });
  } else if (message.method === "tools/list") {
    const tools = message.params?.cursor
      ? [{ name: "fail", description: "Always fails", inputSchema: { type: "object" } }]
      : [
          {
            name: "shout",
            description: "Upper-cases text",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
          },
        ];
    out({
      id: message.id,
      result: { tools, ...(message.params?.cursor ? {} : { nextCursor: "2" }) },
    });
  } else if (message.method === "tools/call") {
    const { name, arguments: args } = message.params;
    out({
      id: message.id,
      result:
        name === "shout"
          ? {
              content: [
                {
                  type: "text",
                  text: `${String(args.text).toUpperCase()} (${process.env.GREETING})`,
                },
              ],
            }
          : { content: [{ type: "text", text: "It broke." }], isError: true },
    });
  }
});
