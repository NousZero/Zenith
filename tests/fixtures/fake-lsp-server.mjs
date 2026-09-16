#!/usr/bin/env node
// A stand-in language server: reports an error for every line containing "ERROR".
// With --pull it answers diagnostic requests instead of pushing, like TypeScript 7.
const pull = process.argv.includes("--pull");
const texts = new Map();
let buffer = Buffer.alloc(0);

const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
};

const check = (text) =>
  text.split("\n").flatMap((line, index) =>
    line.includes("ERROR")
      ? [
          {
            range: { start: { line: index, character: line.indexOf("ERROR") } },
            severity: 1,
            message: "Found ERROR",
          },
        ]
      : line.includes("WARN")
        ? [{ range: { start: { line: index, character: 0 } }, severity: 2, message: "A warning" }]
        : [],
  );

const publish = (uri, text) => {
  texts.set(uri, text);
  if (pull) return;
  const diagnostics = check(text);
  // An empty report first, as real servers sometimes send before checking.
  send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics: [] } });
  setTimeout(
    () => send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } }),
    50,
  );
};

const handle = (message) => {
  if (message.method === "initialize") {
    // Ask the client something first, as real servers do.
    send({ id: 900, method: "workspace/configuration", params: { items: [{}] } });
    const capabilities = { textDocumentSync: 1, ...(pull ? { diagnosticProvider: {} } : {}) };
    send({ id: message.id, result: { capabilities } });
  } else if (message.method === "textDocument/diagnostic") {
    const items = check(texts.get(message.params.textDocument.uri) ?? "");
    send({ id: message.id, result: { kind: "full", items } });
  } else if (message.method === "textDocument/didOpen") {
    publish(message.params.textDocument.uri, message.params.textDocument.text);
  } else if (message.method === "textDocument/didChange") {
    publish(message.params.textDocument.uri, message.params.contentChanges[0].text);
  } else if (message.method === "shutdown") {
    send({ id: message.id, result: null });
  } else if (message.method === "exit") {
    process.exit(0);
  }
};

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) return;
    const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, end).toString())[1]);
    if (buffer.length < end + 4 + length) return;
    const body = buffer.subarray(end + 4, end + 4 + length).toString();
    buffer = buffer.subarray(end + 4 + length);
    handle(JSON.parse(body));
  }
});
