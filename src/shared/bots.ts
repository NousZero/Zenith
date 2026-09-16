export type BotPlatform =
  "telegram" | "discord" | "slack" | "whatsapp" | "signal" | "homeassistant";

export interface BotField {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface BotPlatformInfo {
  id: BotPlatform;
  label: string;
  // Longest text one outgoing message may carry on the platform.
  maxLength: number;
  fields: BotField[];
  setup: string[];
}

export const BOT_PLATFORMS: readonly BotPlatformInfo[] = [
  {
    id: "telegram",
    label: "Telegram",
    maxLength: 4096,
    fields: [{ key: "botToken", label: "Bot token", placeholder: "123456:ABC…", secret: true }],
    setup: [
      "Message @BotFather on Telegram, send /newbot, and copy the token it gives you.",
      "Zenith polls Telegram for messages, so no server or public address is needed.",
    ],
  },
  {
    id: "discord",
    label: "Discord",
    maxLength: 2000,
    fields: [{ key: "botToken", label: "Bot token", placeholder: "MTA…", secret: true }],
    setup: [
      "Create an application at discord.com/developers, add a bot, and copy its token.",
      "Invite the bot to a server you share, then send it a direct message. Zenith only answers direct messages.",
    ],
  },
  {
    id: "slack",
    label: "Slack",
    maxLength: 39_000,
    fields: [
      { key: "botToken", label: "Bot token", placeholder: "xoxb-…", secret: true },
      { key: "appToken", label: "App-level token", placeholder: "xapp-…", secret: true },
    ],
    setup: [
      "Create a Slack app, turn on Socket Mode, and create an app-level token with connections:write.",
      "Add the bot scopes chat:write and im:history, subscribe to the message.im event, and install the app.",
      "Zenith only answers direct messages to the app.",
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    maxLength: 4096,
    fields: [
      { key: "accessToken", label: "Access token", placeholder: "EAAG…", secret: true },
      { key: "phoneNumberId", label: "Phone number ID", placeholder: "1234567890", secret: false },
      {
        key: "appSecret",
        label: "App secret",
        placeholder: "From App settings → Basic",
        secret: true,
      },
      {
        key: "verifyToken",
        label: "Webhook verify token",
        placeholder: "Any long random text",
        secret: true,
      },
      { key: "port", label: "Local webhook port", placeholder: "8787", secret: false },
    ],
    setup: [
      "Uses the official WhatsApp Business Cloud API from Meta; unofficial WhatsApp Web tools are not supported.",
      "Meta delivers messages to a public HTTPS webhook. Zenith listens only on 127.0.0.1 at the port above, so expose it with a tunnel you control (for example cloudflared) and enter https://<tunnel>/webhook with your verify token in Meta's webhook settings.",
      "Every webhook request is checked against your app secret before Zenith reads it.",
    ],
  },
  {
    id: "signal",
    label: "Signal",
    maxLength: 4000,
    fields: [
      {
        key: "apiUrl",
        label: "signal-cli REST API address",
        placeholder: "http://127.0.0.1:8080",
        secret: false,
      },
      { key: "number", label: "Bot phone number", placeholder: "+15551234567", secret: false },
    ],
    setup: [
      "Run signal-cli-rest-api (github.com/bbernhard/signal-cli-rest-api) on this computer in normal or native mode, and register or link a phone number for the bot.",
      "The REST API has no password, so keep it on 127.0.0.1. Zenith polls it for messages.",
    ],
  },
  {
    id: "homeassistant",
    label: "Home Assistant",
    maxLength: 10_000,
    fields: [
      {
        key: "url",
        label: "Home Assistant address",
        placeholder: "http://homeassistant.local:8123",
        secret: false,
      },
      {
        key: "accessToken",
        label: "Long-lived access token",
        placeholder: "From your profile → Security",
        secret: true,
      },
    ],
    setup: [
      'Zenith listens for the "zenith_message" event. Fire it from a script or automation with data like {"text": "/pair 123456"}; Home Assistant records which user ran it, and only paired users are answered.',
      'Replies arrive as a "zenith_reply" event with chat_id and text, so an automation can send a notification or speak the reply.',
    ],
  },
];

export function platformInfo(platform: BotPlatform): BotPlatformInfo {
  const info = BOT_PLATFORMS.find((candidate) => candidate.id === platform);
  if (!info) throw new Error(`Unknown bot platform: ${platform}`);
  return info;
}

export type BotState = "off" | "connecting" | "connected" | "error";

export interface BotUser {
  userId: string;
  name: string;
  pairedAt: number;
}

export interface BotStatus {
  platform: BotPlatform;
  enabled: boolean;
  configured: boolean;
  state: BotState;
  detail: string;
  providerId: string;
  modelId: string;
  users: BotUser[];
  pairingCode: string | null;
  pairingExpiresAt: number | null;
}

export interface BotSettingsUpdate {
  enabled?: boolean;
  providerId?: string;
  modelId?: string;
  // Only fields the user filled in; empty values keep what is saved.
  secrets?: Record<string, string>;
}

// Splits a reply into messages that fit the platform, preferring paragraph, then line, then word breaks.
export function splitMessage(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength);
    const breakAt = [
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    ].find((index) => index > maxLength / 2);
    const cut = breakAt ?? maxLength;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

export type BotCommand = { kind: "pair"; code: string } | { kind: "reset" } | { kind: "help" };

export function parseBotCommand(text: string): BotCommand | undefined {
  const match = /^\/(pair|reset|help|start)(?:@\w+)?(?:\s+(\S+))?\s*$/i.exec(text.trim());
  if (!match) return undefined;
  const name = (match[1] ?? "").toLowerCase();
  if (name === "pair") return { kind: "pair", code: match[2] ?? "" };
  if (name === "reset") return { kind: "reset" };
  return { kind: "help" };
}
