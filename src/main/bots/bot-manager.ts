import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  BOT_PLATFORMS,
  parseBotCommand,
  platformInfo,
  splitMessage,
  type BotPlatform,
  type BotSettingsUpdate,
  type BotState,
  type BotStatus,
} from "../../shared/bots";
import type { ChatMessage } from "../../shared/types";

const PAIRING_TTL_MS = 10 * 60_000;
const HISTORY_MESSAGES = 20;
// Wrong codes allowed before a pairing code is cancelled, so it can't be guessed.
const MAX_PAIRING_ATTEMPTS = 5;

export interface IncomingBotMessage {
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  // Direct message with the bot; bots never answer in groups or channels.
  private: boolean;
}

export interface BotTransport {
  start(handlers: {
    onMessage(message: IncomingBotMessage): void;
    onState(state: BotState, detail: string): void;
  }): void;
  stop(): void;
  send(chatId: string, text: string): Promise<void>;
}

export type TransportFactory = (secrets: Record<string, string>) => BotTransport;

export interface BotManagerDeps {
  db: DatabaseSync;
  transports: Record<BotPlatform, TransportFactory>;
  readSecrets(platform: BotPlatform): Promise<Record<string, string>>;
  writeSecrets(platform: BotPlatform, secrets: Record<string, string>): Promise<void>;
  // Returns a message when the connection may not answer bots, e.g. agents that run tools.
  checkConnection(providerId: string): string | undefined;
  reply(request: {
    platform: BotPlatform;
    providerId: string;
    modelId: string;
    messages: ChatMessage[];
  }): Promise<string>;
  onStatus(statuses: BotStatus[]): void;
  now?: () => number;
}

export function createBotManager(deps: BotManagerDeps) {
  const now = deps.now ?? Date.now;
  const { db } = deps;
  const statements = {
    settings: db.prepare(
      "SELECT enabled, provider_id, model_id FROM bot_settings WHERE platform = ?",
    ),
    saveSettings: db.prepare(
      `INSERT INTO bot_settings (platform, enabled, provider_id, model_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (platform) DO UPDATE SET
         enabled = excluded.enabled, provider_id = excluded.provider_id, model_id = excluded.model_id`,
    ),
    users: db.prepare(
      "SELECT user_id, name, paired_at FROM bot_users WHERE platform = ? ORDER BY paired_at",
    ),
    isUser: db.prepare("SELECT 1 FROM bot_users WHERE platform = ? AND user_id = ?"),
    addUser: db.prepare(
      `INSERT INTO bot_users (platform, user_id, name, paired_at, chat_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (platform, user_id) DO UPDATE SET name = excluded.name, chat_id = excluded.chat_id`,
    ),
    chatFor: db.prepare("SELECT chat_id FROM bot_users WHERE platform = ? AND user_id = ?"),
    updateChat: db.prepare("UPDATE bot_users SET chat_id = ? WHERE platform = ? AND user_id = ?"),
    removeUser: db.prepare("DELETE FROM bot_users WHERE platform = ? AND user_id = ?"),
    history: db.prepare(
      `SELECT role, content FROM (
         SELECT id, role, content FROM bot_messages WHERE platform = ? AND chat_id = ?
         ORDER BY id DESC LIMIT ?
       ) ORDER BY id`,
    ),
    addMessage: db.prepare(
      "INSERT INTO bot_messages (platform, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    clearHistory: db.prepare("DELETE FROM bot_messages WHERE platform = ? AND chat_id = ?"),
  };

  const running = new Map<BotPlatform, BotTransport>();
  const states = new Map<BotPlatform, { state: BotState; detail: string }>();
  const configured = new Map<BotPlatform, boolean>();
  const pairing = new Map<BotPlatform, { code: string; expiresAt: number; attempts: number }>();
  const warnedUsers = new Set<string>();
  // Replies in one chat run one at a time, in order.
  const chatQueues = new Map<string, Promise<void>>();

  function settings(platform: BotPlatform) {
    const row = statements.settings.get(platform) as
      { enabled: number; provider_id: string; model_id: string } | undefined;
    return {
      enabled: row?.enabled === 1,
      providerId: row?.provider_id ?? "",
      modelId: row?.model_id ?? "",
    };
  }

  function status(platform: BotPlatform): BotStatus {
    const code = pairing.get(platform);
    const active = code && code.expiresAt > now() ? code : undefined;
    const users = statements.users.all(platform) as unknown as {
      user_id: string;
      name: string;
      paired_at: number;
    }[];
    const state = states.get(platform) ?? { state: "off" as const, detail: "" };
    return {
      platform,
      ...settings(platform),
      configured: configured.get(platform) ?? false,
      state: state.state,
      detail: state.detail,
      users: users.map((user) => ({
        userId: user.user_id,
        name: user.name,
        pairedAt: user.paired_at,
      })),
      pairingCode: active?.code ?? null,
      pairingExpiresAt: active?.expiresAt ?? null,
    };
  }

  const list = () => BOT_PLATFORMS.map((platform) => status(platform.id));
  const publish = () => deps.onStatus(list());

  async function send(platform: BotPlatform, chatId: string, text: string) {
    const transport = running.get(platform);
    if (!transport) return;
    for (const part of splitMessage(text, platformInfo(platform).maxLength)) {
      await transport.send(chatId, part);
    }
  }

  async function answer(platform: BotPlatform, message: IncomingBotMessage) {
    const current = settings(platform);
    const problem = current.providerId
      ? deps.checkConnection(current.providerId)
      : "No connection is chosen for this bot in Zenith yet.";
    if (problem || !current.modelId) {
      await send(
        platform,
        message.chatId,
        problem ?? "No model is chosen for this bot in Zenith yet.",
      );
      return;
    }
    const history = statements.history.all(
      platform,
      message.chatId,
      HISTORY_MESSAGES,
    ) as unknown as ChatMessage[];
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are answering ${message.userName} through ${platformInfo(platform).label}. Reply in plain text suited to a chat app and keep answers concise.`,
      },
      ...history.map(({ role, content }) => ({ role, content })),
      { role: "user", content: message.text },
    ];
    let reply: string;
    try {
      reply = (
        await deps.reply({
          platform,
          providerId: current.providerId,
          modelId: current.modelId,
          messages,
        })
      ).trim();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await send(platform, message.chatId, `Zenith couldn't get a reply: ${reason}`);
      return;
    }
    const timestamp = now();
    statements.addMessage.run(platform, message.chatId, "user", message.text, timestamp);
    statements.addMessage.run(platform, message.chatId, "assistant", reply, timestamp);
    await send(platform, message.chatId, reply || "(The model returned an empty reply.)");
  }

  async function handle(platform: BotPlatform, message: IncomingBotMessage) {
    const text = message.text.trim();
    if (!message.private || text === "") return;
    const command = parseBotCommand(text);
    const paired = statements.isUser.get(platform, message.userId) !== undefined;

    if (command?.kind === "pair") {
      const code = pairing.get(platform);
      if (code && code.expiresAt > now() && command.code === code.code) {
        statements.addUser.run(platform, message.userId, message.userName, now(), message.chatId);
        pairing.delete(platform);
        publish();
        await send(
          platform,
          message.chatId,
          "Paired with Zenith. Send a message to start; /reset clears the conversation.",
        );
      } else {
        if (code && ++code.attempts >= MAX_PAIRING_ATTEMPTS) {
          pairing.delete(platform);
          publish();
        }
        await send(
          platform,
          message.chatId,
          "That pairing code is wrong or has expired. Create a new one in Zenith → Bots.",
        );
      }
      return;
    }
    if (!paired) {
      const key = `${platform}:${message.userId}`;
      if (!warnedUsers.has(key)) {
        warnedUsers.add(key);
        await send(
          platform,
          message.chatId,
          "This bot is private. Its owner can pair you from Zenith → Bots.",
        );
      }
      return;
    }
    // Keep the latest private chat so scheduled results reach the person where they talk to the bot.
    statements.updateChat.run(message.chatId, platform, message.userId);
    if (command?.kind === "reset") {
      statements.clearHistory.run(platform, message.chatId);
      await send(platform, message.chatId, "Conversation cleared.");
      return;
    }
    if (command?.kind === "help") {
      await send(
        platform,
        message.chatId,
        "Send any message to ask Zenith. /reset clears the conversation.",
      );
      return;
    }
    await answer(platform, message);
  }

  function enqueue(platform: BotPlatform, message: IncomingBotMessage): Promise<void> {
    const key = `${platform}:${message.chatId}`;
    const next = (chatQueues.get(key) ?? Promise.resolve())
      .then(() => handle(platform, message))
      .catch((error: unknown) =>
        console.error(`Bot ${platform} failed to handle a message:`, error),
      );
    chatQueues.set(key, next);
    void next.then(() => {
      if (chatQueues.get(key) === next) chatQueues.delete(key);
    });
    return next;
  }

  function stop(platform: BotPlatform) {
    running.get(platform)?.stop();
    running.delete(platform);
    states.set(platform, { state: "off", detail: "" });
  }

  async function sync(platform: BotPlatform) {
    stop(platform);
    const secrets = await deps.readSecrets(platform);
    const complete = platformInfo(platform).fields.every(
      (field) => (secrets[field.key] ?? "").trim() !== "",
    );
    configured.set(platform, complete);
    if (settings(platform).enabled && complete) {
      const transport = deps.transports[platform](secrets);
      running.set(platform, transport);
      states.set(platform, { state: "connecting", detail: "Connecting…" });
      transport.start({
        onMessage: (message) => void enqueue(platform, message),
        onState: (state, detail) => {
          if (running.get(platform) !== transport) return;
          states.set(platform, { state, detail });
          publish();
        },
      });
    }
    publish();
  }

  return {
    list,
    // Resolves once the message has been handled; transports call it without waiting.
    receive: enqueue,

    async startAll() {
      for (const platform of BOT_PLATFORMS) await sync(platform.id);
    },

    async configure(platform: BotPlatform, update: BotSettingsUpdate) {
      platformInfo(platform);
      if (update.secrets) {
        const saved = await deps.readSecrets(platform);
        const filled = Object.fromEntries(
          Object.entries(update.secrets).filter(([, value]) => value.trim() !== ""),
        );
        await deps.writeSecrets(platform, { ...saved, ...filled });
      }
      const current = settings(platform);
      statements.saveSettings.run(
        platform,
        (update.enabled ?? current.enabled) ? 1 : 0,
        update.providerId ?? current.providerId,
        update.modelId ?? current.modelId,
      );
      await sync(platform);
      return list();
    },

    startPairing(platform: BotPlatform) {
      platformInfo(platform);
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      pairing.set(platform, { code, expiresAt: now() + PAIRING_TTL_MS, attempts: 0 });
      publish();
      return list();
    },

    removeUser(platform: BotPlatform, userId: string) {
      statements.removeUser.run(platform, userId);
      publish();
      return list();
    },

    // Sends text to a paired person's chat; throws when the bot is off or the person never chatted.
    async notify(platform: BotPlatform, userId: string, text: string) {
      if (!running.has(platform))
        throw new Error(`The ${platformInfo(platform).label} bot is not running.`);
      const row = statements.chatFor.get(platform, userId) as
        { chat_id: string | null } | undefined;
      if (!row?.chat_id) throw new Error("That person is not paired with the bot.");
      await send(platform, row.chat_id, text);
    },

    stopAll() {
      for (const platform of BOT_PLATFORMS) stop(platform.id);
    },
  };
}

export type BotManager = ReturnType<typeof createBotManager>;
