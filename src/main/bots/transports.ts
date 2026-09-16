import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

import { asRecord } from "../cli/cli-adapter";
import type { BotTransport, IncomingBotMessage, TransportFactory } from "./bot-manager";

const RECONNECT_MS = 5_000;
const WHATSAPP_GRAPH_VERSION = "v23.0";

type Json = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

async function readJson(response: Response, what: string): Promise<Json> {
  const body = asRecord(await response.json().catch(() => undefined));
  if (!response.ok || !body) {
    const reason =
      str(asRecord(body)?.["description"]) || str(body?.["error"]) || response.statusText;
    throw new Error(`${what} failed (${response.status}): ${reason}`);
  }
  return body;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ---- Telegram: long polling with getUpdates ----------------------------------------------------

export function parseTelegramUpdate(update: Json): IncomingBotMessage | undefined {
  const message = asRecord(update["message"]);
  const chat = asRecord(message?.["chat"]);
  const from = asRecord(message?.["from"]);
  const text = str(message?.["text"]);
  if (!message || !chat || !from || !text) return undefined;
  const name = [str(from["first_name"]), str(from["last_name"])].filter(Boolean).join(" ");
  return {
    chatId: str(chat["id"]),
    userId: str(from["id"]),
    userName: name || str(from["username"]) || "Telegram user",
    text,
    private: chat["type"] === "private",
  };
}

export function createTelegramTransport(
  secrets: Record<string, string>,
  apiBase = "https://api.telegram.org",
): BotTransport {
  const base = `${apiBase}/bot${secrets["botToken"] ?? ""}`;
  const controller = new AbortController();
  return {
    start({ onMessage, onState }) {
      void (async () => {
        let offset = 0;
        let connected = false;
        while (!controller.signal.aborted) {
          try {
            if (!connected) {
              const me = await readJson(
                await fetch(`${base}/getMe`, { signal: controller.signal }),
                "Telegram sign-in",
              );
              connected = true;
              onState("connected", `Connected as @${str(asRecord(me["result"])?.["username"])}`);
            }
            const body = await readJson(
              await fetch(
                `${base}/getUpdates?timeout=50&offset=${offset}&allowed_updates=["message"]`,
                {
                  signal: controller.signal,
                },
              ),
              "Telegram polling",
            );
            for (const update of Array.isArray(body["result"]) ? body["result"] : []) {
              const record = asRecord(update);
              if (!record) continue;
              offset = Math.max(offset, Number(record["update_id"]) + 1);
              const message = parseTelegramUpdate(record);
              if (message) onMessage(message);
            }
          } catch (error) {
            if (controller.signal.aborted) return;
            connected = false;
            onState("error", error instanceof Error ? error.message : String(error));
            await sleep(RECONNECT_MS, controller.signal);
          }
        }
      })();
    },
    stop: () => controller.abort(),
    async send(chatId, text) {
      await readJson(
        await fetch(`${base}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        }),
        "Telegram sendMessage",
      );
    },
  };
}

// ---- Discord: Gateway WebSocket for direct messages ----------------------------------------------

const DISCORD_API = "https://discord.com/api/v10";
// DIRECT_MESSAGES only; message content in DMs needs no privileged intent.
const DISCORD_INTENTS = 1 << 12;

export function parseDiscordMessage(data: Json): IncomingBotMessage | undefined {
  const author = asRecord(data["author"]);
  const text = str(data["content"]);
  if (!author || author["bot"] === true || !text) return undefined;
  return {
    chatId: str(data["channel_id"]),
    userId: str(author["id"]),
    userName: str(author["global_name"]) || str(author["username"]) || "Discord user",
    text,
    private: data["guild_id"] === undefined || data["guild_id"] === null,
  };
}

export const createDiscordTransport: TransportFactory = (secrets) => {
  const token = secrets["botToken"] ?? "";
  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const controller = new AbortController();
  let socket: WebSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  return {
    start({ onMessage, onState }) {
      const connect = async () => {
        if (controller.signal.aborted) return;
        try {
          const gateway = await readJson(
            await fetch(`${DISCORD_API}/gateway/bot`, { headers, signal: controller.signal }),
            "Discord sign-in",
          );
          let sequence: number | null = null;
          const ws = new WebSocket(`${str(gateway["url"])}/?v=10&encoding=json`);
          socket = ws;
          ws.addEventListener("message", (event) => {
            const payload = asRecord(JSON.parse(String(event.data)));
            if (!payload) return;
            if (typeof payload["s"] === "number") sequence = payload["s"];
            const op = payload["op"];
            const data = asRecord(payload["d"]) ?? {};
            if (op === 10) {
              clearInterval(heartbeat);
              heartbeat = setInterval(
                () => ws.send(JSON.stringify({ op: 1, d: sequence })),
                Number(data["heartbeat_interval"]) || 41_250,
              );
              ws.send(
                JSON.stringify({
                  op: 2,
                  d: {
                    token,
                    intents: DISCORD_INTENTS,
                    properties: { os: process.platform, browser: "zenith", device: "zenith" },
                  },
                }),
              );
            } else if (op === 0 && payload["t"] === "READY") {
              onState("connected", `Connected as ${str(asRecord(data["user"])?.["username"])}`);
            } else if (op === 0 && payload["t"] === "MESSAGE_CREATE") {
              const message = parseDiscordMessage(data);
              if (message) onMessage(message);
            } else if (op === 7 || op === 9) {
              ws.close();
            }
          });
          ws.addEventListener("close", (event) => {
            clearInterval(heartbeat);
            if (controller.signal.aborted) return;
            onState("error", `Disconnected from Discord (${event.code}); reconnecting…`);
            setTimeout(() => void connect(), RECONNECT_MS);
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          onState("error", error instanceof Error ? error.message : String(error));
          setTimeout(() => void connect(), RECONNECT_MS);
        }
      };
      void connect();
    },
    stop() {
      controller.abort();
      clearInterval(heartbeat);
      socket?.close();
    },
    async send(chatId, text) {
      await readJson(
        await fetch(`${DISCORD_API}/channels/${encodeURIComponent(chatId)}/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content: text }),
        }),
        "Discord message",
      );
    },
  };
};

// ---- Slack: Socket Mode for direct messages ------------------------------------------------------

export function parseSlackEnvelope(envelope: Json): IncomingBotMessage | undefined {
  const event = asRecord(asRecord(envelope["payload"])?.["event"]);
  if (
    !event ||
    event["type"] !== "message" ||
    event["subtype"] !== undefined ||
    event["bot_id"] !== undefined
  ) {
    return undefined;
  }
  const text = str(event["text"]);
  if (!text) return undefined;
  return {
    chatId: str(event["channel"]),
    userId: str(event["user"]),
    userName: str(event["user"]) || "Slack user",
    text,
    private: event["channel_type"] === "im",
  };
}

export const createSlackTransport: TransportFactory = (secrets) => {
  const controller = new AbortController();
  let socket: WebSocket | undefined;
  const slack = async (method: string, token: string, body: Json) => {
    const result = await readJson(
      await fetch(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      `Slack ${method}`,
    );
    if (result["ok"] !== true) throw new Error(`Slack ${method} failed: ${str(result["error"])}`);
    return result;
  };

  return {
    start({ onMessage, onState }) {
      const connect = async () => {
        if (controller.signal.aborted) return;
        try {
          const opened = await slack("apps.connections.open", secrets["appToken"] ?? "", {});
          const ws = new WebSocket(str(opened["url"]));
          socket = ws;
          ws.addEventListener("message", (event) => {
            const envelope = asRecord(JSON.parse(String(event.data)));
            if (!envelope) return;
            if (typeof envelope["envelope_id"] === "string") {
              ws.send(JSON.stringify({ envelope_id: envelope["envelope_id"] }));
            }
            if (envelope["type"] === "hello") onState("connected", "Connected with Socket Mode");
            if (envelope["type"] === "disconnect") ws.close();
            if (envelope["type"] === "events_api") {
              const message = parseSlackEnvelope(envelope);
              if (message) onMessage(message);
            }
          });
          ws.addEventListener("close", () => {
            if (controller.signal.aborted) return;
            onState("connecting", "Reconnecting to Slack…");
            setTimeout(() => void connect(), 1_000);
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          onState("error", error instanceof Error ? error.message : String(error));
          setTimeout(() => void connect(), RECONNECT_MS);
        }
      };
      void connect();
    },
    stop() {
      controller.abort();
      socket?.close();
    },
    async send(chatId, text) {
      await slack("chat.postMessage", secrets["botToken"] ?? "", { channel: chatId, text });
    },
  };
};

// ---- WhatsApp Business Cloud API: signed webhook on 127.0.0.1 -----------------------------------

export function verifyWhatsAppSignature(
  appSecret: string,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function parseWhatsAppWebhook(body: Json): IncomingBotMessage[] {
  const entries = Array.isArray(body["entry"]) ? body["entry"] : [];
  return entries.flatMap((entry) =>
    (Array.isArray(asRecord(entry)?.["changes"])
      ? (asRecord(entry)?.["changes"] as unknown[])
      : []
    ).flatMap((change) => {
      const value = asRecord(asRecord(change)?.["value"]);
      const contacts = Array.isArray(value?.["contacts"]) ? value["contacts"] : [];
      const messages = Array.isArray(value?.["messages"]) ? value["messages"] : [];
      return messages.flatMap((item): IncomingBotMessage[] => {
        const message = asRecord(item);
        const text = str(asRecord(message?.["text"])?.["body"]);
        const from = str(message?.["from"]);
        if (message?.["type"] !== "text" || !text || !from) return [];
        const contact = contacts
          .map(asRecord)
          .find((candidate) => str(candidate?.["wa_id"]) === from);
        return [
          {
            chatId: from,
            userId: from,
            userName: str(asRecord(contact?.["profile"])?.["name"]) || `+${from}`,
            text,
            private: true,
          },
        ];
      });
    }),
  );
}

export function createWhatsAppTransport(
  secrets: Record<string, string>,
  graphBase = "https://graph.facebook.com",
): BotTransport {
  let server: Server | undefined;
  return {
    start({ onMessage, onState }) {
      const port = Number(secrets["port"]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        onState("error", "The local webhook port must be a number from 1024 to 65535.");
        return;
      }
      server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/webhook") {
          response.writeHead(404).end();
          return;
        }
        if (request.method === "GET") {
          const ok =
            url.searchParams.get("hub.mode") === "subscribe" &&
            url.searchParams.get("hub.verify_token") === secrets["verifyToken"];
          response.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
          response.end(ok ? (url.searchParams.get("hub.challenge") ?? "") : "");
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) request.destroy();
          else chunks.push(chunk);
        });
        request.on("end", () => {
          const raw = Buffer.concat(chunks);
          const signature = request.headers["x-hub-signature-256"];
          if (
            !verifyWhatsAppSignature(
              secrets["appSecret"] ?? "",
              raw,
              Array.isArray(signature) ? signature[0] : signature,
            )
          ) {
            response.writeHead(401).end();
            return;
          }
          response.writeHead(200).end();
          const body = asRecord(JSON.parse(raw.toString("utf8") || "{}"));
          for (const message of body ? parseWhatsAppWebhook(body) : []) onMessage(message);
        });
      });
      server.on("error", (error) => onState("error", `Webhook server: ${error.message}`));
      server.listen(port, "127.0.0.1", () =>
        onState("connected", `Listening on http://127.0.0.1:${port}/webhook`),
      );
    },
    stop() {
      server?.close();
    },
    async send(chatId, text) {
      const response = await fetch(
        `${graphBase}/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(secrets["phoneNumberId"] ?? "")}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secrets["accessToken"] ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: chatId,
            type: "text",
            text: { body: text },
          }),
        },
      );
      await readJson(response, "WhatsApp message");
    },
  };
}

// ---- Signal: signal-cli-rest-api on this computer ---------------------------------------------

export function parseSignalMessage(item: Json): IncomingBotMessage | undefined {
  const envelope = asRecord(item["envelope"]);
  const data = asRecord(envelope?.["dataMessage"]);
  const text = str(data?.["message"]);
  const from =
    str(envelope?.["sourceNumber"]) || str(envelope?.["sourceUuid"]) || str(envelope?.["source"]);
  if (!envelope || !data || !text || !from) return undefined;
  return {
    chatId: from,
    userId: from,
    userName: str(envelope["sourceName"]) || from,
    text,
    private: data["groupInfo"] === undefined || data["groupInfo"] === null,
  };
}

function httpBase(value: string | undefined, what: string): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/.test(base))
    throw new Error(`${what} must start with http:// or https://.`);
  return base;
}

export const createSignalTransport: TransportFactory = (secrets) => {
  const controller = new AbortController();
  const number = secrets["number"] ?? "";
  return {
    start({ onMessage, onState }) {
      void (async () => {
        let connected = false;
        while (!controller.signal.aborted) {
          try {
            const base = httpBase(secrets["apiUrl"], "The signal-cli REST API address");
            if (!connected) {
              await readJson(
                await fetch(`${base}/v1/about`, { signal: controller.signal }),
                "Signal connection",
              );
              connected = true;
              onState("connected", `Connected to signal-cli REST API as ${number}`);
            }
            const response = await fetch(
              `${base}/v1/receive/${encodeURIComponent(number)}?timeout=20`,
              { signal: controller.signal },
            );
            const body: unknown = await response.json().catch(() => undefined);
            if (!response.ok || !Array.isArray(body)) {
              throw new Error(`Signal receive failed (${response.status}).`);
            }
            // Older API versions return at once instead of waiting; don't poll in a tight loop.
            if (body.length === 0) await sleep(1_000, controller.signal);
            for (const item of body) {
              const record = asRecord(item);
              const message = record ? parseSignalMessage(record) : undefined;
              if (message) onMessage(message);
            }
          } catch (error) {
            if (controller.signal.aborted) return;
            connected = false;
            onState("error", error instanceof Error ? error.message : String(error));
            await sleep(RECONNECT_MS, controller.signal);
          }
        }
      })();
    },
    stop: () => controller.abort(),
    async send(chatId, text) {
      await readJson(
        await fetch(`${httpBase(secrets["apiUrl"], "The signal-cli REST API address")}/v2/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, number, recipients: [chatId] }),
        }),
        "Signal message",
      );
    },
  };
};

// ---- Home Assistant: WebSocket events in, REST events out ----------------------------------------

export function parseHomeAssistantEvent(message: Json): IncomingBotMessage | undefined {
  const event = asRecord(message["event"]);
  const data = asRecord(event?.["data"]);
  const text = str(data?.["text"]);
  // Only the user Home Assistant recorded as running the action, never a name in the event data.
  const userId = str(asRecord(event?.["context"])?.["user_id"]);
  if (message["type"] !== "event" || !text || !userId) return undefined;
  return {
    chatId: userId,
    userId,
    userName: str(data?.["name"]) || "Home Assistant user",
    text,
    private: true,
  };
}

export const createHomeAssistantTransport: TransportFactory = (secrets) => {
  const controller = new AbortController();
  const token = secrets["accessToken"] ?? "";
  let socket: WebSocket | undefined;
  return {
    start({ onMessage, onState }) {
      const connect = () => {
        if (controller.signal.aborted) return;
        let base: string;
        try {
          base = httpBase(secrets["url"], "The Home Assistant address");
        } catch (error) {
          onState("error", (error as Error).message);
          return;
        }
        let rejected = false;
        const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/websocket`);
        socket = ws;
        ws.addEventListener("message", (event) => {
          let payload: Json | undefined;
          try {
            payload = asRecord(JSON.parse(String(event.data)));
          } catch {
            return;
          }
          if (!payload) return;
          if (payload["type"] === "auth_required") {
            ws.send(JSON.stringify({ type: "auth", access_token: token }));
          } else if (payload["type"] === "auth_invalid") {
            rejected = true;
            onState("error", "Home Assistant rejected the access token.");
            ws.close();
          } else if (payload["type"] === "auth_ok") {
            ws.send(
              JSON.stringify({ id: 1, type: "subscribe_events", event_type: "zenith_message" }),
            );
            onState(
              "connected",
              `Connected to Home Assistant ${str(payload["ha_version"])}`.trim(),
            );
          } else {
            const message = parseHomeAssistantEvent(payload);
            if (message) onMessage(message);
          }
        });
        ws.addEventListener("error", () => undefined);
        ws.addEventListener("close", () => {
          if (controller.signal.aborted || rejected) return;
          onState("error", "Disconnected from Home Assistant; reconnecting…");
          setTimeout(connect, RECONNECT_MS);
        });
      };
      connect();
    },
    stop() {
      controller.abort();
      socket?.close();
    },
    async send(chatId, text) {
      await readJson(
        await fetch(
          `${httpBase(secrets["url"], "The Home Assistant address")}/api/events/zenith_reply`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
          },
        ),
        "Home Assistant event",
      );
    },
  };
};
