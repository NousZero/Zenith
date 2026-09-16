import { BarChart3, MessageCircleQuestion, Search, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buildAskPrompt, splitHits } from "../shared/history";
import type { HistoryExcerpt, SearchResult, SemanticStatus, UsageInsights } from "../shared/types";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { Textarea } from "./components/ui/textarea";
import { formatRelativeTime, formatTokens } from "./lib/format";
import { cn } from "./lib/utils";
import { Markdown } from "./Markdown";
import { DEFAULT_CLI_MODEL_ID, providerMeta } from "./providers";
import { describeSendError } from "./useHarness";

export type HistoryTab = "search" | "ask" | "insights";

export interface AskTarget {
  id: string;
  label: string;
  providerId: string;
  modelId: string;
}

const TABS: { id: HistoryTab; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "ask", label: "Ask", icon: MessageCircleQuestion },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

const DAY_MS = 86_400_000;
const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "all", label: "All time", days: undefined },
] as const;

function modelName(providerId: string, modelId: string): string {
  const provider = providerMeta(providerId).label;
  return modelId && modelId !== DEFAULT_CLI_MODEL_ID ? `${provider} · ${modelId}` : provider;
}

function SearchTab(props: { initialQuery: string; onOpenSession(id: string): void }) {
  const [query, setQuery] = useState(props.initialQuery);
  const [results, setResults] = useState<{ query: string; items: SearchResult[] }>({
    query: "",
    items: [],
  });

  useEffect(() => {
    if (query.trim() === "") return;
    const timer = setTimeout(() => {
      window.zenith.history
        .search(query)
        .then((items) => setResults({ query, items }))
        .catch((error: unknown) => console.error("Search failed:", error));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const items = query.trim() === "" ? [] : results.items;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background/60 px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          aria-label="Search all sessions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every message in every session…"
          className="h-10 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Search results">
        {query.trim() === "" ? (
          <li className="px-2 py-8 text-center text-[13px] text-muted-foreground">
            Words match from their start, accents ignored.
          </li>
        ) : items.length === 0 && results.query === query ? (
          <li className="px-2 py-8 text-center text-[13px] text-muted-foreground">
            No messages match.
          </li>
        ) : (
          items.map((result) => (
            <li key={result.messageId}>
              <button
                type="button"
                onClick={() => props.onOpenSession(result.sessionId)}
                className="flex w-full cursor-pointer flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors duration-150 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      providerMeta(result.providerId).dotClass,
                    )}
                  />
                  <span className="truncate font-medium text-foreground">{result.sessionName}</span>
                  <span className="truncate">
                    {result.paneName} · {result.role === "user" ? "you" : result.role}
                  </span>
                  <span className="ml-auto shrink-0">{formatRelativeTime(result.updatedAt)}</span>
                </span>
                <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                  {splitHits(result.snippet).map((part, index) =>
                    part.hit ? (
                      <mark key={index} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={index}>{part.text}</span>
                    ),
                  )}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function MeaningSearch() {
  const [status, setStatus] = useState<SemanticStatus | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.zenith.history
      .semanticStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setMessage("Checking the model…");
    try {
      const next = await window.zenith.history.setSemanticModel(draft ?? status?.model ?? "");
      setStatus(next);
      setDraft(null);
      setMessage(next.model ? "" : "Meaning search is off.");
    } catch (caught: unknown) {
      setMessage(
        (caught instanceof Error ? caught.message : String(caught)).replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          "",
        ),
      );
    }
  }

  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        Meaning-based search: {status?.model ? `on (${status.model})` : "off"}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="leading-relaxed">
          Finds past messages that mean the same thing even with different words, using an Ollama
          embedding model on this computer. Pull one first, for example{" "}
          <code className="font-mono">ollama pull nomic-embed-text</code>. Leave empty to use word
          matching only.
        </p>
        <div className="flex gap-2">
          <input
            aria-label="Embedding model"
            value={draft ?? status?.model ?? ""}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="nomic-embed-text"
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" variant="outline" disabled={draft === null} onClick={() => void save()}>
            Save
          </Button>
        </div>
        {status?.model && (
          <span>
            {status.indexed} of {status.total} messages indexed; more are indexed each time you ask.
          </span>
        )}
        {message && <span role="status">{message}</span>}
      </div>
    </details>
  );
}

function AskTab(props: { initialQuestion: string; targets: AskTarget[] }) {
  const [question, setQuestion] = useState(props.initialQuestion);
  const [targetId, setTargetId] = useState(props.targets[0]?.id ?? "");
  const [answer, setAnswer] = useState("");
  const [excerpts, setExcerpts] = useState<HistoryExcerpt[]>([]);
  const [status, setStatus] = useState<"idle" | "asking" | "error">("idle");
  const [error, setError] = useState("");
  const active = useRef<{ requestId: string; unsubscribe(): void } | undefined>(undefined);
  const target = props.targets.find((candidate) => candidate.id === targetId) ?? props.targets[0];

  useEffect(() => () => active.current?.unsubscribe(), []);

  function finish() {
    active.current?.unsubscribe();
    active.current = undefined;
  }

  async function ask() {
    const text = question.trim();
    if (!text || !target || status === "asking") return;
    finish();
    setStatus("asking");
    setAnswer("");
    setError("");
    let requestId: string | undefined;
    try {
      const found = await window.zenith.history.retrieve(text);
      setExcerpts(found);
      requestId = crypto.randomUUID();
      const unsubscribe = window.zenith.chat.onChunk((payload) => {
        if (payload.requestId !== requestId) return;
        if (payload.chunk.delta) setAnswer((current) => current + payload.chunk.delta);
        if (payload.chunk.done) {
          setStatus("idle");
          finish();
        }
      });
      active.current = { requestId, unsubscribe };
      await window.zenith.chat.send({
        requestId,
        paneId: "history-ask",
        providerId: target.providerId,
        modelId: target.modelId,
        messages: [{ role: "user", content: buildAskPrompt(text, found) }],
      });
    } catch (caught: unknown) {
      // A stopped request is not an error.
      if (requestId !== undefined && active.current?.requestId !== requestId) return;
      finish();
      setStatus("error");
      setError(describeSendError(caught));
    }
  }

  function stop() {
    if (active.current) void window.zenith.chat.abort(active.current.requestId);
    finish();
    setStatus("idle");
  }

  if (props.targets.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Set up a pane with a ready connection and model first; its model answers questions about
        your history.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Textarea
        autoFocus
        aria-label="Question about your history"
        rows={2}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void ask();
          }
        }}
        placeholder="e.g. What did we decide about the database schema?"
        className="resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          Answer with
          <select
            aria-label="Model that answers"
            value={target?.id}
            onChange={(event) => setTargetId(event.target.value)}
            className="h-8 min-w-0 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {props.targets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        {status === "asking" ? (
          <Button size="sm" variant="secondary" onClick={stop}>
            <Square className="fill-current" />
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={question.trim() === ""} onClick={() => void ask()}>
            <MessageCircleQuestion />
            Ask
          </Button>
        )}
      </div>
      <MeaningSearch />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background/40 p-4">
        {status === "error" ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : answer ? (
          <Markdown content={answer} />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {status === "asking"
              ? `Reading ${excerpts.length} matching ${excerpts.length === 1 ? "message" : "messages"}…`
              : "Zenith finds past messages that match your question and asks the model to answer from them."}
          </p>
        )}
        {excerpts.length > 0 && (
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Based on {excerpts.length} {excerpts.length === 1 ? "message" : "messages"}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {excerpts.map((excerpt, index) => (
                <li key={index} className="rounded-md bg-muted/40 p-2">
                  <span className="font-medium text-foreground">{excerpt.sessionName}</span> ·{" "}
                  {excerpt.paneName} · {excerpt.role === "user" ? "you" : excerpt.role}
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{excerpt.content}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {props.label}
      </span>
      <span className="font-mono text-lg tabular-nums text-foreground">{props.value}</span>
    </div>
  );
}

function InsightsTab() {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7d");
  const [insights, setInsights] = useState<UsageInsights | undefined>(undefined);

  useEffect(() => {
    const days = RANGES.find((candidate) => candidate.id === range)?.days;
    const since = days === undefined ? 0 : Date.now() - days * DAY_MS;
    let cancelled = false;
    window.zenith.history
      .insights(since)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch((error: unknown) => console.error("Failed to load insights:", error));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const maxConnectionTokens = Math.max(
    1,
    ...(insights?.byConnection.map((row) => row.inputTokens + row.outputTokens) ?? []),
  );
  const maxDayTokens = Math.max(1, ...(insights?.byDay.map((row) => row.tokens) ?? []));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div role="radiogroup" aria-label="Time range" className="flex gap-1 self-start">
        {RANGES.map((candidate) => (
          <Button
            key={candidate.id}
            role="radio"
            aria-checked={range === candidate.id}
            size="xs"
            variant={range === candidate.id ? "secondary" : "ghost"}
            onClick={() => setRange(candidate.id)}
          >
            {candidate.label}
          </Button>
        ))}
      </div>

      {!insights ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : insights.turns === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          No replies in this range yet. Usage is recorded from now on for every reply.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Replies" value={String(insights.turns)} />
            <Stat label="Sessions" value={String(insights.sessions)} />
            <Stat label="Input tokens" value={formatTokens(insights.inputTokens)} />
            <Stat label="Output tokens" value={formatTokens(insights.outputTokens)} />
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              By connection
            </h3>
            <ul className="flex flex-col gap-2">
              {insights.byConnection.map((row) => {
                const tokens = row.inputTokens + row.outputTokens;
                return (
                  <li key={`${row.providerId}:${row.modelId}`} className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn("size-2 rounded-full", providerMeta(row.providerId).dotClass)}
                      />
                      <span className="truncate">{modelName(row.providerId, row.modelId)}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {row.turns} {row.turns === 1 ? "reply" : "replies"} ·{" "}
                        {formatTokens(row.inputTokens)} in · {formatTokens(row.outputTokens)} out
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          providerMeta(row.providerId).dotClass,
                        )}
                        style={{ width: `${Math.max((tokens / maxConnectionTokens) * 100, 1)}%` }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tokens per day
            </h3>
            <div className="flex h-28 gap-1" role="list" aria-label="Tokens per day">
              {insights.byDay.map((row) => (
                <div
                  key={row.day}
                  role="listitem"
                  title={`${row.day}: ${row.tokens} tokens in ${row.turns} replies`}
                  className="flex h-full min-w-3 max-w-12 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="flex min-h-0 w-full flex-1 items-end">
                    <span
                      className="w-full rounded-t-sm bg-primary/70"
                      style={{ height: `${Math.max((row.tokens / maxDayTokens) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="text-[10px] text-muted-foreground">{row.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          {insights.estimatedTurns > 0 && (
            <p className="text-xs text-muted-foreground">
              {insights.estimatedTurns} of {insights.turns} replies came from tools that report no
              usage; their tokens are estimated at four characters per token.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function HistoryDialog(props: {
  state: { tab: HistoryTab; query: string } | null;
  askTargets: AskTarget[];
  onStateChange(state: { tab: HistoryTab; query: string } | null): void;
  onOpenSession(id: string): void;
}) {
  const state = props.state;
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && props.onStateChange(null)}>
      <DialogContent className="h-[min(680px,85vh)] w-[min(780px,calc(100vw-48px))] gap-4">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Everything you've discussed in Zenith, across all sessions.
          </DialogDescription>
        </div>
        <div role="tablist" aria-label="History" className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={state?.tab === tab.id}
              onClick={() => state && props.onStateChange({ ...state, tab: tab.id })}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state?.tab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
        {state?.tab === "search" && (
          <SearchTab initialQuery={state.query} onOpenSession={props.onOpenSession} />
        )}
        {state?.tab === "ask" && (
          <AskTab initialQuestion={state.query} targets={props.askTargets} />
        )}
        {state?.tab === "insights" && <InsightsTab />}
      </DialogContent>
    </Dialog>
  );
}
