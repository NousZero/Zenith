import { ChevronRight, KeyRound, ShieldCheck, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";

import { BOT_PLATFORMS, type BotPlatformInfo, type BotStatus } from "../shared/bots";
import type { ConnectionStatus, Model } from "../shared/types";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { formatRelativeTime } from "./lib/format";
import { cn } from "./lib/utils";
import { DEFAULT_CLI_MODEL_ID, providerMeta, usesDefaultModel } from "./providers";

const SELECT_CLASS =
  "h-8 min-w-0 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function StateDot({ status }: { status: BotStatus }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status.state === "connected" && "bg-success",
        status.state === "connecting" && "bg-warning motion-safe:animate-pulse",
        status.state === "error" && "bg-danger",
        status.state === "off" && "bg-muted-foreground/50",
      )}
    />
  );
}

function BotCard(props: {
  info: BotPlatformInfo;
  status: BotStatus;
  // Connections that may answer bots: ready, and never agents that run tools.
  connections: ConnectionStatus[];
  onUpdate(statuses: BotStatus[]): void;
}) {
  const { info, status } = props;
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [models, setModels] = useState<{ providerId: string; items: Model[] }>({
    providerId: "",
    items: [],
  });
  const [error, setError] = useState("");

  const provider = props.connections.find((connection) => connection.id === status.providerId);
  const needsModelList = provider !== undefined && !usesDefaultModel(provider.kind);

  useEffect(() => {
    if (!needsModelList) return;
    let cancelled = false;
    window.zenith.providers
      .listModels(status.providerId)
      .then((items) => {
        if (!cancelled) setModels({ providerId: status.providerId, items });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsModelList, status.providerId]);

  function run(update: Promise<BotStatus[]>) {
    update.then(props.onUpdate).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }

  const filled = Object.values(secrets).some((value) => value.trim() !== "");
  const modelItems = models.providerId === status.providerId ? models.items : [];

  return (
    <section
      aria-label={`${info.label} bot`}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex items-center gap-2.5">
        <StateDot status={status} />
        <h3 className="text-sm font-semibold">{info.label}</h3>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {status.detail ||
            (status.configured ? (status.enabled ? "Starting…" : "Off") : "Not set up")}
        </span>
        <Switch
          aria-label={`Turn ${info.label} bot ${status.enabled ? "off" : "on"}`}
          checked={status.enabled}
          disabled={!status.configured}
          onCheckedChange={(enabled) => run(window.zenith.bots.configure(info.id, { enabled }))}
        />
      </div>

      <button
        type="button"
        aria-expanded={showSetup}
        onClick={() => setShowSetup((value) => !value)}
        className="flex cursor-pointer items-center gap-1.5 self-start rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", showSetup && "rotate-90")}
          aria-hidden
        />
        How to set up {info.label}
      </button>
      {showSetup && (
        <ol className="flex list-decimal flex-col gap-1 pl-8 text-xs leading-relaxed text-muted-foreground">
          {info.setup.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      <form
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!filled) return;
          run(window.zenith.bots.configure(info.id, { secrets }));
          setSecrets({});
        }}
      >
        {info.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {field.label}
            <Input
              type={field.secret ? "password" : "text"}
              autoComplete="off"
              value={secrets[field.key] ?? ""}
              onChange={(event) =>
                setSecrets((current) => ({ ...current, [field.key]: event.target.value }))
              }
              placeholder={status.configured ? "Saved; type to replace" : field.placeholder}
              className="h-8 font-mono text-xs"
            />
          </label>
        ))}
        {/* With an odd number of fields the button fills the last cell beside the final input. */}
        <div
          className={cn(
            "flex items-end justify-end",
            info.fields.length % 2 === 0 && "sm:col-span-2",
          )}
        >
          <Button type="submit" size="sm" variant="outline" disabled={!filled}>
            <KeyRound />
            Save {info.fields.length === 1 ? "token" : "settings"}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Replies with
        <select
          aria-label={`Connection ${info.label} replies with`}
          value={status.providerId}
          onChange={(event) => {
            const next = props.connections.find(
              (connection) => connection.id === event.target.value,
            );
            run(
              window.zenith.bots.configure(info.id, {
                providerId: event.target.value,
                modelId: next && usesDefaultModel(next.kind) ? DEFAULT_CLI_MODEL_ID : "",
              }),
            );
          }}
          className={SELECT_CLASS}
        >
          <option value="">Choose a connection…</option>
          {props.connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label}
            </option>
          ))}
        </select>
        {needsModelList && (
          <select
            aria-label={`Model ${info.label} replies with`}
            value={status.modelId}
            onChange={(event) =>
              run(window.zenith.bots.configure(info.id, { modelId: event.target.value }))
            }
            className={SELECT_CLASS}
          >
            <option value="">Choose a model…</option>
            {modelItems.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-xs text-muted-foreground">
            {status.users.length === 0
              ? "Nobody is paired yet; the bot ignores everyone else."
              : `${status.users.length} paired ${status.users.length === 1 ? "person" : "people"}`}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={!status.configured}
            onClick={() => run(window.zenith.bots.pair(info.id))}
          >
            Pair a person
          </Button>
        </div>
        {status.pairingCode && (
          <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">
            Within 10 minutes, send{" "}
            <code className="font-mono text-sm font-semibold">/pair {status.pairingCode}</code> to
            the {info.label} bot in a direct message.
          </p>
        )}
        {status.users.length > 0 && (
          <ul className="flex flex-col gap-1">
            {status.users.map((user) => (
              <li key={user.userId} className="flex items-center gap-2 text-xs">
                <span className="truncate text-foreground">{user.name}</span>
                <span className="text-muted-foreground">
                  paired {formatRelativeTime(user.pairedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${user.name}`}
                  className="ml-auto"
                  onClick={() => run(window.zenith.bots.removeUser(info.id, user.userId))}
                >
                  <UserMinus />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

export function BotsDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  connections: ConnectionStatus[];
}) {
  const [statuses, setStatuses] = useState<BotStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.zenith.bots
      .list()
      .then((next) => {
        if (!cancelled) setStatuses(next);
      })
      .catch((error: unknown) => console.error("Failed to list bots:", error));
    const unsubscribe = window.zenith.bots.onStatus(setStatuses);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const chatConnections = props.connections.filter(
    (connection) => connection.state === "ready" && connection.kind !== "agent",
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(720px,calc(100vw-48px))]">
        <DialogHeader>
          <DialogTitle>Bots</DialogTitle>
          <DialogDescription>
            Talk to Zenith from chat apps while it runs on this computer. Bots answer only people
            you pair, only in direct messages, and only through chat connections, so a message can
            never run tools. Tokens are encrypted with your operating system's secure storage.
          </DialogDescription>
        </DialogHeader>
        {BOT_PLATFORMS.map((info) => {
          const status = statuses.find((candidate) => candidate.platform === info.id);
          return status ? (
            <BotCard
              key={info.id}
              info={info}
              status={status}
              connections={chatConnections.map((connection) => ({
                ...connection,
                label: providerMeta(connection.id).label,
              }))}
              onUpdate={setStatuses}
            />
          ) : null;
        })}
      </DialogContent>
    </Dialog>
  );
}
