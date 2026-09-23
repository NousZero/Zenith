import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createBotManager,
  type BotTransport,
  type IncomingBotMessage,
} from "../../src/main/bots/bot-manager";
import {
  createHomeAssistantTransport,
  createSignalTransport,
  createTelegramTransport,
  createWhatsAppTransport,
  parseDiscordMessage,
  parseHomeAssistantEvent,
  parseSlackEnvelope,
  verifyWhatsAppSignature,
} from "../../src/main/bots/transports";
import { openDatabase } from "../../src/main/database";
import type { BotStatus } from "../../src/shared/bots";
import type { ChatMessage } from "../../src/shared/types";

describe("bot manager", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-bots-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function setup(options: { checkConnection?: (id: string) => string | undefined } = {}) {
    const sent: { chatId: string; text: string }[] = [];
    const prompts: ChatMessage[][] = [];
    let statuses: BotStatus[] = [];
    const transport: BotTransport = {
      start: ({ onState }) => onState("connected", "ok"),
      stop: () => undefined,
      send: async (chatId, text) => {
        sent.push({ chatId, text });
      },
    };
    const secrets: Record<string, Record<string, string>> = {};
    const manager = createBotManager({
      db,
      transports: {
        telegram: () => transport,
        discord: () => transport,
        slack: () => transport,
        whatsapp: () => transport,
        signal: () => transport,
        homeassistant: () => transport,
      },
      readSecrets: async (platform) => secrets[platform] ?? {},
      writeSecrets: async (platform, value) => {
        secrets[platform] = value;
      },
      checkConnection: options.checkConnection ?? (() => undefined),
      reply: async ({ messages }) => {
        prompts.push(messages);
        return `echo: ${messages.at(-1)?.content ?? ""}`;
      },
      onStatus: (next) => {
        statuses = next;
      },
    });
    await manager.configure("telegram", {
      enabled: true,
      providerId: "claude-code",
      modelId: "default",
      secrets: { botToken: "t" },
    });
    const say = (text: string, overrides: Partial<IncomingBotMessage> = {}) =>
      manager.receive("telegram", {
        chatId: "chat-1",
        userId: "user-1",
        userName: "Ada",
        text,
        private: true,
        ...overrides,
      });
    const telegram = () => statuses.find((status) => status.platform === "telegram");
    return { manager, sent, prompts, say, telegram, secrets };
  }

  it("starts configured bots and never exposes secrets in status", async () => {
    const { telegram, manager, secrets } = await setup();
    expect(telegram()).toMatchObject({ enabled: true, configured: true, state: "connected" });
    expect(JSON.stringify(manager.list())).not.toContain('"t"');
    await manager.configure("telegram", { secrets: { botToken: "" } });
    expect(secrets["telegram"]).toEqual({ botToken: "t" });
  });

  it("answers only users paired with a desktop code", async () => {
    const { manager, sent, prompts, say, telegram } = await setup();
    await say("hello");
    await say("hello again");
    expect(sent.map((message) => message.text)).toEqual([
      "This bot is private. Its owner can pair you from Zenith → Bots.",
    ]);
    expect(prompts).toHaveLength(0);

    manager.startPairing("telegram");
    const code = telegram()?.pairingCode ?? "";
    expect(code).toMatch(/^\d{6}$/);
    await say(`/pair ${code}`);
    expect(telegram()?.users.map((user) => user.name)).toEqual(["Ada"]);
    expect(telegram()?.pairingCode).toBeNull();

    await say("what is 2+2?");
    expect(sent.at(-1)?.text).toBe("echo: what is 2+2?");
    await say("and again");
    expect(prompts.at(-1)?.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);

    await say("/reset");
    await say("fresh");
    expect(prompts.at(-1)?.map((message) => message.role)).toEqual(["system", "user"]);

    // A removed user gets no reply; they were already told the bot is private.
    manager.removeUser("telegram", "user-1");
    const promptCount = prompts.length;
    await say("still there?");
    expect(prompts).toHaveLength(promptCount);
    expect(sent.at(-1)?.text).toBe("echo: fresh");
  });

  it("ignores group messages and cancels a pairing code after five wrong guesses", async () => {
    const { manager, sent, say, telegram } = await setup();
    manager.startPairing("telegram");
    const code = telegram()?.pairingCode ?? "";
    await say(`/pair ${code}`, { private: false });
    expect(sent).toEqual([]);
    for (let attempt = 0; attempt < 5; attempt++)
      await say("/pair 000000x", { userId: "attacker" });
    expect(telegram()?.pairingCode).toBeNull();
    await say(`/pair ${code}`);
    expect(telegram()?.users).toEqual([]);
  });

  it("refuses connections that may not answer bots", async () => {
    const { manager, sent, say, telegram, prompts } = await setup({
      checkConnection: () => "agents are not allowed",
    });
    manager.startPairing("telegram");
    await say(`/pair ${telegram()?.pairingCode ?? ""}`);
    await say("run rm -rf");
    expect(sent.at(-1)?.text).toBe("agents are not allowed");
    expect(prompts).toHaveLength(0);
  });
});

describe("Telegram transport", () => {
  let server: Server;
  let base: string;
  const sentMessages: unknown[] = [];

  beforeEach(async () => {
    let served = false;
    server = createServer((request, response) => {
      const url = request.url ?? "";
      response.setHeader("Content-Type", "application/json");
      if (url.includes("/getMe")) {
        response.end(JSON.stringify({ ok: true, result: { username: "zenith_test_bot" } }));
      } else if (url.includes("/getUpdates")) {
        const result = served
          ? []
          : [
              {
                update_id: 7,
                message: {
                  text: "hi",
                  chat: { id: 42, type: "private" },
                  from: { id: 9, first_name: "Ada" },
                },
              },
            ];
        served = true;
        setTimeout(
          () => response.end(JSON.stringify({ ok: true, result })),
          result.length ? 0 : 200,
        );
      } else if (url.includes("/sendMessage")) {
        let body = "";
        request.on("data", (chunk: Buffer) => (body += chunk.toString()));
        request.on("end", () => {
          sentMessages.push(JSON.parse(body));
          response.end(JSON.stringify({ ok: true, result: {} }));
        });
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false, description: "Not Found" }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it("polls for private messages and sends replies", async () => {
    const transport = createTelegramTransport({ botToken: "TOKEN" }, base);
    const states: string[] = [];
    const message = await new Promise<IncomingBotMessage>((resolve) =>
      transport.start({ onMessage: resolve, onState: (_state, detail) => states.push(detail) }),
    );
    expect(message).toEqual({
      chatId: "42",
      userId: "9",
      userName: "Ada",
      text: "hi",
      private: true,
    });
    expect(states).toContain("Connected as @zenith_test_bot");
    await transport.send("42", "hello back");
    transport.stop();
    expect(sentMessages).toEqual([{ chat_id: "42", text: "hello back" }]);
  });
});

describe("Telegram transport redirects", () => {
  it("refuses a redirect from Telegram's API, so the bot token goes nowhere else", async () => {
    let base = "";
    let elsewhereHits = 0;
    const server = createServer((request, response) => {
      if ((request.url ?? "").includes("/elsewhere")) {
        elsewhereHits++;
        response.end(JSON.stringify({ ok: true, result: {} }));
      } else {
        response.writeHead(307, { location: `${base}/elsewhere` }).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const transport = createTelegramTransport({ botToken: "TOKEN" }, base);
    const states: string[] = [];
    await new Promise<void>((resolve) =>
      transport.start({
        onMessage: () => undefined,
        onState: (state, detail) => {
          states.push(detail);
          if (state === "error") resolve();
        },
      }),
    );
    transport.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));

    expect(states.at(-1)).toMatch(/redirect/);
    expect(elsewhereHits).toBe(0);
  });
});

describe("WhatsApp webhook", () => {
  it("verifies the subscription, rejects unsigned posts, and accepts signed messages", async () => {
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    const secrets = {
      appSecret: "shh",
      verifyToken: "verify-me",
      port: String(port),
      accessToken: "a",
      phoneNumberId: "1",
    };
    const transport = createWhatsAppTransport(secrets);
    const received: IncomingBotMessage[] = [];
    await new Promise<void>((resolve) =>
      transport.start({
        onMessage: (message) => received.push(message),
        onState: (state) => state === "connected" && resolve(),
      }),
    );
    try {
      const base = `http://127.0.0.1:${port}/webhook`;
      const challenge = await fetch(
        `${base}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`,
      );
      expect(await challenge.text()).toBe("abc");
      expect(
        (await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc`)).status,
      ).toBe(403);

      const body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [{ wa_id: "15551234567", profile: { name: "Ada" } }],
                  messages: [{ from: "15551234567", type: "text", text: { body: "hi" } }],
                },
              },
            ],
          },
        ],
      });
      expect((await fetch(base, { method: "POST", body })).status).toBe(401);
      const signature = `sha256=${createHmac("sha256", "shh").update(body).digest("hex")}`;
      const accepted = await fetch(base, {
        method: "POST",
        body,
        headers: { "X-Hub-Signature-256": signature },
      });
      expect(accepted.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(received).toEqual([
        {
          chatId: "15551234567",
          userId: "15551234567",
          userName: "Ada",
          text: "hi",
          private: true,
        },
      ]);
    } finally {
      transport.stop();
    }
    expect(verifyWhatsAppSignature("shh", Buffer.from("x"), "sha256=00")).toBe(false);
  });
});

describe("Discord and Slack parsing", () => {
  it("keeps human direct messages and marks server messages as not private", () => {
    expect(
      parseDiscordMessage({ channel_id: "c", content: "hi", author: { id: "u", username: "ada" } }),
    ).toEqual({ chatId: "c", userId: "u", userName: "ada", text: "hi", private: true });
    expect(
      parseDiscordMessage({ channel_id: "c", guild_id: "g", content: "hi", author: { id: "u" } })
        ?.private,
    ).toBe(false);
    expect(parseDiscordMessage({ content: "hi", author: { id: "b", bot: true } })).toBeUndefined();
  });

  it("reads Slack DM events and skips bot or edited messages", () => {
    const envelope = (event: Record<string, unknown>) => ({
      type: "events_api",
      payload: { event },
    });
    expect(
      parseSlackEnvelope(
        envelope({ type: "message", channel_type: "im", user: "U1", text: "hi", channel: "D1" }),
      ),
    ).toEqual({ chatId: "D1", userId: "U1", userName: "U1", text: "hi", private: true });
    expect(
      parseSlackEnvelope(envelope({ type: "message", bot_id: "B", text: "hi" })),
    ).toBeUndefined();
    expect(
      parseSlackEnvelope(envelope({ type: "message", subtype: "message_changed", text: "hi" })),
    ).toBeUndefined();
  });
});

// Records requests and answers from a route table.
async function jsonServer(routes: Record<string, (body: string) => unknown>) {
  const requests: { path: string; body: string; auth: string }[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      const path = (request.url ?? "").split("?")[0] ?? "";
      requests.push({ path, body, auth: request.headers.authorization ?? "" });
      const route = routes[`${request.method} ${path}`];
      response.writeHead(route ? 200 : 404, { "Content-Type": "application/json" });
      response.end(JSON.stringify(route ? route(body) : { error: "not found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe("Signal transport", () => {
  it("polls signal-cli REST API for messages and sends replies", async () => {
    let polled = 0;
    const server = await jsonServer({
      "GET /v1/about": () => ({ versions: ["v1", "v2"] }),
      "GET /v1/receive/%2B15550001": () =>
        polled++ === 0
          ? [
              { envelope: { sourceNumber: "+15550002", sourceName: "Ada", dataMessage: {} } },
              {
                envelope: {
                  sourceNumber: "+15550003",
                  dataMessage: { message: "group hi", groupInfo: { groupId: "g" } },
                },
              },
              {
                envelope: {
                  sourceNumber: "+15550002",
                  sourceName: "Ada",
                  dataMessage: { message: "hi" },
                },
              },
            ]
          : [],
      "POST /v2/send": () => ({ timestamp: "1" }),
    });
    const transport = createSignalTransport({ apiUrl: `${server.base}/`, number: "+15550001" });
    const messages: IncomingBotMessage[] = [];
    try {
      await new Promise<void>((resolve) =>
        transport.start({
          onMessage: (message) => {
            messages.push(message);
            if (message.text === "hi") resolve();
          },
          onState: () => undefined,
        }),
      );
      expect(messages).toEqual([
        {
          chatId: "+15550003",
          userId: "+15550003",
          userName: "+15550003",
          text: "group hi",
          private: false,
        },
        { chatId: "+15550002", userId: "+15550002", userName: "Ada", text: "hi", private: true },
      ]);
      await transport.send("+15550002", "hello");
      expect(
        JSON.parse(server.requests.find((request) => request.path === "/v2/send")?.body ?? ""),
      ).toEqual({
        message: "hello",
        number: "+15550001",
        recipients: ["+15550002"],
      });
    } finally {
      transport.stop();
      await server.close();
    }
  });
});

describe("Home Assistant transport", () => {
  it("accepts only events Home Assistant attributes to a user", () => {
    const event = (context: Record<string, unknown>, data: Record<string, unknown>) => ({
      type: "event",
      event: { event_type: "zenith_message", data, context },
    });
    expect(
      parseHomeAssistantEvent(event({ user_id: "u1" }, { text: "/pair 123456", name: "Ada" })),
    ).toEqual({
      chatId: "u1",
      userId: "u1",
      userName: "Ada",
      text: "/pair 123456",
      private: true,
    });
    // Automations fire events with no user; a user named in the data is not trusted.
    expect(
      parseHomeAssistantEvent(event({ user_id: null }, { text: "hi", user: "u1" })),
    ).toBeUndefined();
    expect(parseHomeAssistantEvent({ type: "result", success: true })).toBeUndefined();
  });

  it("sends replies as a zenith_reply event with the access token", async () => {
    const server = await jsonServer({
      "POST /api/events/zenith_reply": () => ({ message: "Event zenith_reply fired." }),
    });
    try {
      const transport = createHomeAssistantTransport({ url: server.base, accessToken: "TOKEN" });
      await transport.send("u1", "hello");
      expect(server.requests[0]).toEqual({
        path: "/api/events/zenith_reply",
        body: JSON.stringify({ chat_id: "u1", text: "hello" }),
        auth: "Bearer TOKEN",
      });
      await expect(
        createHomeAssistantTransport({ url: "homeassistant.local", accessToken: "x" }).send(
          "u1",
          "x",
        ),
      ).rejects.toThrow("must start with http");
    } finally {
      await server.close();
    }
  });
});
