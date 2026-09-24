// A minimal ACP agent for tests. Replies "<sessionId>|<model>|<prompt text>" and reacts to
// PERMISSION (asks for approval), HANG (waits for session/cancel), and CRASH (exits).
import { createInterface } from "node:readline";

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
const models = new Map();
const hanging = new Map();
const waiting = new Map();
let sessions = 0;
const signIn = process.env.FAKE_ACP_SIGN_IN;
let signedIn = false;
let outgoing = 1000;

function chunk(sessionId, text) {
  send({
    method: "session/update",
    params: {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    },
  });
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === undefined) {
    waiting.get(message.id)?.(message.result);
    return;
  }
  const { id, method, params } = message;
  if (method === "initialize") {
    // FAKE_ACP_SIGN_IN=works|unsupported acts like Gemini over ACP: sessions are refused with a
    // misleading "API key" error until the client authenticates with a sign-in method.
    const authMethods = signIn ? [{ id: "oauth-personal" }, { id: "gemini-api-key" }] : undefined;
    return send({ id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods } });
  }
  if (method === "authenticate") {
    if (signIn === "works" && params.methodId === "oauth-personal") {
      signedIn = true;
      return send({ id, result: {} });
    }
    return send({
      id,
      error: { code: -32000, message: "This client is no longer supported for your account." },
    });
  }
  if (method === "session/new" && signIn && !signedIn) {
    return send({
      id,
      error: { code: -32000, message: "Gemini API key is missing or not configured." },
    });
  }
  if (method === "session/new") {
    const sessionId = `s${++sessions}`;
    models.set(sessionId, "default");
    return send({
      id,
      result: { sessionId, models: { availableModels: [{ modelId: "m1", name: "Model One" }] } },
    });
  }
  if (method === "session/set_model") {
    models.set(params.sessionId, params.modelId);
    return send({ id, result: {} });
  }
  if (method === "session/cancel") {
    hanging.get(params.sessionId)?.();
    return;
  }
  if (method === "session/prompt") {
    const text = params.prompt[0].text;
    const sessionId = params.sessionId;
    if (text.includes("CRASH")) {
      process.stderr.write("fake agent crashed on purpose\n");
      process.exit(3);
    }
    if (text.includes("HANG")) {
      chunk(sessionId, "working");
      hanging.set(sessionId, () => send({ id, result: { stopReason: "cancelled" } }));
      return;
    }
    if (text.includes("PERMISSION")) {
      const requestId = outgoing++;
      waiting.set(requestId, (result) => {
        chunk(sessionId, `outcome=${JSON.stringify(result.outcome)}`);
        send({ id, result: { stopReason: "end_turn" } });
      });
      send({
        id: requestId,
        method: "session/request_permission",
        params: {
          sessionId,
          toolCall: { toolCallId: "t1", title: "rm -rf build" },
          options: [
            { optionId: "yes", name: "Allow once", kind: "allow_once" },
            { optionId: "no", name: "Deny", kind: "reject_once" },
          ],
        },
      });
      return;
    }
    send({
      method: "session/update",
      params: { sessionId, update: { sessionUpdate: "usage_update", size: 64000, used: 900 } },
    });
    chunk(sessionId, `${sessionId}|${models.get(sessionId)}|`);
    chunk(sessionId, text);
    return send({
      id,
      result: { stopReason: "end_turn", usage: { inputTokens: 11, outputTokens: 5 } },
    });
  }
  send({ id, error: { code: -32601, message: `unknown ${method}` } });
});
