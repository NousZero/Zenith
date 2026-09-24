import { useCallback, useEffect, useRef, useState } from "react";

import {
  branchMessages,
  retryTarget,
  titleFromPrompt,
  undoLastExchange,
} from "../shared/conversation";
import {
  buildCompactionPrompt,
  buildSynthesisPrompt,
  COMPACT_KEEP_MESSAGES,
  compactMessages,
  shouldCompact,
} from "../shared/context";
import { buildFanOutMessages } from "../shared/fan-out";
import { PLAN_MODE_INSTRUCTIONS } from "../shared/library";
import { personalityPrompt } from "../shared/personalities";
import { estimateTokens } from "../shared/tokens";
import type {
  AgentActivity,
  AgentTodo,
  ImageAttachment,
  PaneMessage,
  PaneState,
  PermissionRequest,
  PersonaFile,
  SessionState,
  TokenUsage,
} from "../shared/types";

// Electron prefixes errors thrown in the main process; the pane only needs the reason.
export function describeSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

export interface PaneDefaults {
  providerId: string;
  modelId: string;
}

const FALLBACK_PANE_DEFAULTS: PaneDefaults = { providerId: "claude-code", modelId: "default" };

export function createPane(id: string, defaults: PaneDefaults = FALLBACK_PANE_DEFAULTS): PaneState {
  return {
    id,
    name: "Conversation",
    providerId: defaults.providerId,
    modelId: defaults.modelId,
    included: true,
    memoryEnabled: false,
    messages: [],
    promptTokens: 0,
    completionTokens: 0,
    lastError: null,
    contextWindow: null,
    projectPath: null,
    agentPath: null,
    planMode: false,
  };
}

export const NEW_SESSION_NAME = "New session";

interface LoadedAgent {
  name: string;
  body: string;
  tools?: string[];
}

// What an agent did during a pane's latest reply in a project folder.
export interface AgentTurn {
  turnId: string;
  activities: AgentActivity[];
  todos: AgentTodo[];
  rolledBack: string[] | null;
  // True when Zenith snapshotted the project first, so undo also covers commands.
  snapshot: boolean;
}

export function createEmptySession(id: string, defaults?: PaneDefaults): SessionState {
  return {
    id,
    name: NEW_SESSION_NAME,
    memoryText: "",
    personalityId: "",
    panes: [createPane(crypto.randomUUID(), defaults)],
    updatedAt: Date.now(),
  };
}

export function useHarness(
  initial: SessionState,
  persona: Record<PersonaFile, string>,
  // Called when an agent saved something to the user's profile.
  onMemoryChanged?: () => void,
) {
  const memoryChanged = useRef(onMemoryChanged);
  useEffect(() => {
    memoryChanged.current = onMemoryChanged;
  });
  const [session, setSession] = useState<SessionState>(initial);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const addPane = useCallback((defaults?: PaneDefaults) => {
    setSession((current) => ({
      ...current,
      panes: [...current.panes, createPane(crypto.randomUUID(), defaults)],
    }));
  }, []);

  const updatePane = useCallback((paneId: string, patch: Partial<PaneState>) => {
    setSession((current) => ({
      ...current,
      panes: current.panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)),
    }));
  }, []);

  const setMemoryText = useCallback((memoryText: string) => {
    setSession((current) => ({ ...current, memoryText }));
  }, []);

  const setPersonality = useCallback((personalityId: string) => {
    setSession((current) => ({ ...current, personalityId }));
  }, []);

  // Only panes with an entry here are streaming; the entry is removed when the reply ends.
  const streamState = useRef(
    new Map<
      string,
      {
        requestId: string;
        // The session the reply belongs to, which may no longer be the open one.
        sessionId: string;
        assistantId: string;
        text: string;
        usage?: TokenUsage;
      }
    >(),
  );
  const [streamingPaneIds, setStreamingPaneIds] = useState<ReadonlySet<string>>(new Set());
  // Pane id to session id for every running reply, so a tab or rail row other than the open one
  // can show that its session is working.
  const [runningSessions, setRunningSessions] = useState<ReadonlyMap<string, string>>(new Map());
  const [agentTurns, setAgentTurns] = useState<Record<string, AgentTurn>>({});
  // Why a pane's running agent has gone quiet, until it shows progress again.
  const [notices, setNotices] = useState<Record<string, string>>({});
  // Agent approvals waiting for the user, oldest first.
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);

  // A prompt written during a run waits here until the last reply ends, then goes on its own.
  const queuedRef = useRef<{ prompt: string; images: ImageAttachment[] } | null>(null);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const sendQueued = useRef(() => {});

  const endStream = useCallback((paneId: string) => {
    streamState.current.delete(paneId);
    setStreamingPaneIds(new Set(streamState.current.keys()));
    setRunningSessions(
      new Map([...streamState.current].map(([id, entry]) => [id, entry.sessionId])),
    );
    setPermissions((current) => current.filter((request) => request.paneId !== paneId));
    if (streamState.current.size === 0) sendQueued.current();
  }, []);

  const queuePrompt = useCallback((prompt: string, images: ImageAttachment[]) => {
    queuedRef.current = { prompt, images };
    setQueuedPrompt(prompt);
  }, []);

  const cancelQueue = useCallback(() => {
    queuedRef.current = null;
    setQueuedPrompt(null);
  }, []);

  const respondPermission = useCallback((permissionId: string, optionId: string | null) => {
    setPermissions((current) => current.filter((request) => request.permissionId !== permissionId));
    void window.zenith.chat.respondPermission(permissionId, optionId);
  }, []);

  const abortPane = useCallback(
    (paneId: string) => {
      const state = streamState.current.get(paneId);
      if (!state) return;
      void window.zenith.chat.abort(state.requestId);
      endStream(paneId);
    },
    [endStream],
  );

  const removePane = useCallback(
    (paneId: string) => {
      abortPane(paneId);
      setSession((current) => ({
        ...current,
        panes: current.panes.filter((pane) => pane.id !== paneId),
      }));
    },
    [abortPane],
  );

  const ensureChunkListener = useCallback(() => {
    if (unsubscribeRef.current) return;
    const unsubscribePermissions = window.zenith.chat.onPermission((request) => {
      if (streamState.current.get(request.paneId)?.requestId !== request.requestId) {
        void window.zenith.chat.respondPermission(request.permissionId, null);
        return;
      }
      setPermissions((current) => [...current, request]);
    });
    const unsubscribeChunks = window.zenith.chat.onChunk(({ requestId, paneId, chunk }) => {
      const state = streamState.current.get(paneId);
      if (!state || state.requestId !== requestId) return;
      state.text += chunk.delta;
      if (chunk.usage) state.usage = chunk.usage;
      if (chunk.contextUsage) state.usage = chunk.contextUsage;
      const { assistantId, text, usage: reported, sessionId } = state;
      if (chunk.done) endStream(paneId);
      // A reply that ends while another session is open is written to its own session on disk,
      // since that session is no longer in memory.
      if (chunk.done && !sessionRef.current.panes.some((pane) => pane.id === paneId)) {
        void saveFinishedReply(sessionId, paneId, (pane) =>
          withReply(pane, assistantId, text, true, reported, chunk.contextWindow),
        ).catch((error: unknown) => console.error("Failed to save a finished reply:", error));
      }
      const { activity, todos, snapshot } = chunk;
      if (chunk.notice) {
        const notice = chunk.notice;
        setNotices((current) => ({ ...current, [paneId]: notice }));
      } else if (chunk.delta || activity || todos || chunk.done) {
        setNotices((current) =>
          paneId in current
            ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== paneId))
            : current,
        );
      }
      if (chunk.memoryChanged) memoryChanged.current?.();
      if (activity || todos || snapshot) {
        setAgentTurns((current) => {
          const turn = current[paneId];
          if (turn?.turnId !== requestId) return current;
          const timed = (previous: AgentActivity | undefined, next: AgentActivity) => {
            const startedAt = previous?.startedAt ?? Date.now();
            const finished = next.status !== "running" && next.status !== "awaiting-approval";
            const endedAt = finished ? (previous?.endedAt ?? Date.now()) : undefined;
            return { ...next, startedAt, ...(endedAt === undefined ? {} : { endedAt }) };
          };
          const activities = activity
            ? turn.activities.some((item) => item.id === activity.id)
              ? turn.activities.map((item) =>
                  item.id === activity.id ? timed(item, activity) : item,
                )
              : [...turn.activities, timed(undefined, activity)]
            : turn.activities;
          return {
            ...current,
            [paneId]: {
              ...turn,
              activities,
              todos: todos ?? turn.todos,
              snapshot: turn.snapshot || snapshot === true,
            },
          };
        });
      }
      if (!chunk.delta && !chunk.done) return;
      setSession((current) => ({
        ...current,
        panes: current.panes.map((pane) =>
          pane.id === paneId
            ? withReply(pane, assistantId, text, chunk.done, reported, chunk.contextWindow)
            : pane,
        ),
      }));
    });
    unsubscribeRef.current = () => {
      unsubscribePermissions();
      unsubscribeChunks();
    };
  }, [endStream]);

  const userProfile = persona["USER.md"].trim();
  const personaText = [
    persona["SOUL.md"].trim(),
    userProfile ? `About the user:\n${userProfile}` : "",
    personalityPrompt(session.personalityId),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");

  // Starts a turn: prompt after history, replacing whatever the pane held before.
  // outgoingPrompt is what the model receives when it differs from the prompt shown in the pane.
  const startTurn = useCallback(
    (
      pane: PaneState,
      history: PaneMessage[],
      prompt: string,
      outgoingPrompt = prompt,
      agent?: LoadedAgent,
      images: ImageAttachment[] = [],
    ) => {
      if (!pane.modelId) return;
      abortPane(pane.id);
      ensureChunkListener();
      const requestId = crypto.randomUUID();
      streamState.current.set(pane.id, {
        requestId,
        sessionId: session.id,
        assistantId: crypto.randomUUID(),
        text: "",
      });
      setStreamingPaneIds(new Set(streamState.current.keys()));
      setRunningSessions(
        new Map([...streamState.current].map(([id, entry]) => [id, entry.sessionId])),
      );
      const paneInstructions = [
        personaText,
        agent ? `You are acting as the "${agent.name}" agent:\n${agent.body}` : "",
        pane.planMode ? PLAN_MODE_INSTRUCTIONS : "",
      ]
        .filter((part) => part.trim() !== "")
        .join("\n\n");
      const outgoing = buildFanOutMessages(
        { ...pane, messages: history },
        outgoingPrompt,
        session.memoryText,
        paneInstructions,
        images,
      );
      setAgentTurns((current) =>
        pane.projectPath
          ? {
              ...current,
              [pane.id]: {
                turnId: requestId,
                activities: [],
                todos: [],
                rolledBack: null,
                snapshot: false,
              },
            }
          : Object.fromEntries(Object.entries(current).filter(([id]) => id !== pane.id)),
      );
      setSession((current) => ({
        ...current,
        name:
          current.name === NEW_SESSION_NAME && history.length === 0
            ? titleFromPrompt(prompt)
            : current.name,
        panes: current.panes.map((candidate) =>
          candidate.id === pane.id
            ? {
                ...candidate,
                messages: [
                  ...history,
                  {
                    // The reply's checkpoints are kept under requestId, so the prompt that
                    // started it doubles as a restore point.
                    id: requestId,
                    role: "user",
                    content: prompt,
                    ...(images.length ? { images } : {}),
                  },
                ],
                promptTokens: estimateTokens(outgoing.map((m) => m.content).join("\n")),
                lastError: null,
              }
            : candidate,
        ),
      }));
      void window.zenith.chat
        .send({
          requestId,
          sessionId: session.id,
          paneId: pane.id,
          providerId: pane.providerId,
          modelId: pane.modelId,
          messages: outgoing,
          projectPath: pane.projectPath,
          planMode: pane.planMode,
          ...(agent?.tools ? { allowedTools: agent.tools } : {}),
        })
        .catch((error: unknown) => {
          // An aborted or superseded request is not an error for the pane.
          if (streamState.current.get(pane.id)?.requestId !== requestId) return;
          endStream(pane.id);
          console.error(`chat.send failed for pane ${pane.id}`, error);
          const message = describeSendError(error);
          const lastError = message.includes("No credential configured")
            ? `No API key configured for ${pane.providerId}.`
            : message;
          updatePane(pane.id, { lastError });
        });
    },
    [
      session.id,
      session.memoryText,
      personaText,
      abortPane,
      ensureChunkListener,
      endStream,
      updatePane,
    ],
  );

  const [compactingPaneIds, setCompactingPaneIds] = useState<ReadonlySet<string>>(new Set());
  const compacting = useRef(new Set<string>());

  // Replaces all but the most recent messages with a summary written by the pane's own model.
  const summarize = useCallback(
    async (pane: PaneState, messages: PaneMessage[]): Promise<PaneMessage[]> => {
      compacting.current.add(pane.id);
      setCompactingPaneIds(new Set(compacting.current));
      try {
        const summary = await window.zenith.chat.complete({
          sessionId: session.id,
          providerId: pane.providerId,
          modelId: pane.modelId,
          messages: [
            {
              role: "user",
              content: buildCompactionPrompt(messages.slice(0, -COMPACT_KEEP_MESSAGES)),
            },
          ],
        });
        if (summary.trim() === "") throw new Error("The model returned an empty summary.");
        return compactMessages(messages, summary, () => crypto.randomUUID());
      } finally {
        compacting.current.delete(pane.id);
        setCompactingPaneIds(new Set(compacting.current));
      }
    },
    [session.id],
  );

  // Agent files are read once and reused; the Library clears this after edits.
  const agentCache = useRef(new Map<string, LoadedAgent>());
  const loadAgent = useCallback(
    async (pane: PaneState): Promise<LoadedAgent | undefined> => {
      const path = pane.agentPath;
      if (!path) return undefined;
      const cached = agentCache.current.get(path);
      if (cached) return cached;
      const read = () => window.zenith.library.read(path);
      // The main process only reads files from its latest scan, so rescan once if needed.
      const result = await read().catch(async () => {
        await window.zenith.library.list(
          session.panes.flatMap((candidate) =>
            candidate.projectPath ? [candidate.projectPath] : [],
          ),
        );
        return read();
      });
      const agent: LoadedAgent = {
        name: result.item.name,
        body: result.body,
        ...(result.item.tools ? { tools: result.item.tools } : {}),
      };
      agentCache.current.set(path, agent);
      return agent;
    },
    [session.panes],
  );

  const sendWithHistory = useCallback(
    async (
      pane: PaneState,
      history: PaneMessage[],
      prompt: string,
      outgoingPrompt = prompt,
      images: ImageAttachment[] = [],
    ) => {
      if (!pane.modelId || compacting.current.has(pane.id)) return;
      let agent: LoadedAgent | undefined;
      try {
        agent = await loadAgent(pane);
      } catch (error: unknown) {
        updatePane(pane.id, {
          lastError: `Couldn't load this pane's agent: ${describeSendError(error)}`,
        });
        return;
      }
      let messages = history;
      if (shouldCompact({ ...pane, messages: history })) {
        abortPane(pane.id);
        try {
          messages = await summarize(pane, history);
        } catch (error: unknown) {
          // Send anyway; the provider reports it if the context really overflows.
          console.error(`Automatic compaction failed for pane ${pane.id}`, error);
        }
      }
      startTurn(pane, messages, prompt, outgoingPrompt, agent, images);
    },
    [abortPane, summarize, startTurn, loadAgent, updatePane],
  );

  const compactPane = useCallback(
    async (paneId: string) => {
      const pane = session.panes.find((candidate) => candidate.id === paneId);
      if (!pane?.modelId || pane.messages.length <= COMPACT_KEEP_MESSAGES) return;
      if (streamState.current.has(paneId) || compacting.current.has(paneId)) return;
      try {
        const messages = await summarize(pane, pane.messages);
        const lastId = pane.messages.at(-1)?.id;
        setSession((current) => ({
          ...current,
          panes: current.panes.map((candidate) =>
            // Skip if the conversation changed while the summary was being written.
            candidate.id === paneId && candidate.messages.at(-1)?.id === lastId
              ? {
                  ...candidate,
                  messages,
                  promptTokens: estimateTokens(messages.map((m) => m.content).join("\n")),
                  completionTokens: 0,
                  lastError: null,
                }
              : candidate,
          ),
        }));
      } catch (error: unknown) {
        updatePane(paneId, { lastError: `Could not compact: ${describeSendError(error)}` });
      }
    },
    [session.panes, summarize, updatePane],
  );

  // Mixture of Agents: every included pane's latest answer goes to the aggregator pane's model,
  // whose combined answer streams into a new pane that is left out of broadcasts.
  const synthesize = useCallback(
    (aggregatorPaneId: string) => {
      const answered = session.panes.filter(
        (pane) =>
          pane.included &&
          pane.messages.at(-1)?.role === "assistant" &&
          !streamState.current.has(pane.id),
      );
      const aggregator = session.panes.find((pane) => pane.id === aggregatorPaneId);
      if (!aggregator || answered.length < 2) return;
      const lead = answered.find((pane) => pane.id === aggregatorPaneId) ?? answered[0];
      const question = lead && retryTarget(lead.messages)?.prompt;
      if (!question) return;
      const answers = answered.map((pane) => ({
        source: `${pane.name} (${pane.providerId}${pane.modelId && pane.modelId !== "default" ? ` · ${pane.modelId}` : ""})`,
        content: pane.messages.at(-1)?.content ?? "",
      }));
      const synthesis: PaneState = {
        ...createPane(crypto.randomUUID(), {
          providerId: aggregator.providerId,
          modelId: aggregator.modelId,
        }),
        name: "Synthesis",
        included: false,
      };
      setSession((current) => ({ ...current, panes: [...current.panes, synthesis] }));
      startTurn(
        synthesis,
        [],
        `Synthesize ${answers.length} answers: ${question}`,
        buildSynthesisPrompt(question, answers),
      );
    },
    [session.panes, startTurn],
  );

  const sendToPane = useCallback(
    (pane: PaneState, prompt: string, outgoingPrompt = prompt, images: ImageAttachment[] = []) =>
      void sendWithHistory(pane, pane.messages, prompt, outgoingPrompt, images),
    [sendWithHistory],
  );

  // switchTo moves the pane to another assistant first, so the same prompt and history go to the
  // one the person picked instead of the one that failed.
  const retryPane = useCallback(
    (paneId: string, switchTo?: Partial<PaneState>) => {
      const found = session.panes.find((candidate) => candidate.id === paneId);
      const pane = found && { ...found, ...switchTo };
      const target = pane && retryTarget(pane.messages);
      if (pane && switchTo) updatePane(paneId, switchTo);
      if (pane && target) {
        void sendWithHistory(pane, target.history, target.prompt, target.prompt, target.images);
      }
    },
    [session.panes, sendWithHistory, updatePane],
  );

  const undoPane = useCallback(
    (paneId: string) => {
      abortPane(paneId);
      setSession((current) => ({
        ...current,
        panes: current.panes.map((pane) =>
          pane.id === paneId
            ? { ...pane, messages: undoLastExchange(pane.messages), lastError: null }
            : pane,
        ),
      }));
    },
    [abortPane],
  );

  // Forks a pane into a new pane beside it, keeping messages up to messageId.
  const branchPane = useCallback((paneId: string, messageId: string) => {
    setSession((current) => {
      const index = current.panes.findIndex((pane) => pane.id === paneId);
      const source = current.panes[index];
      if (!source) return current;
      const branch: PaneState = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} (branch)`,
        messages: branchMessages(source.messages, messageId, () => crypto.randomUUID()),
        lastError: null,
      };
      const panes = [...current.panes];
      panes.splice(index + 1, 0, branch);
      return { ...current, panes };
    });
  }, []);

  // outgoingPrompt is what models receive when it differs from the text shown, e.g. a skill.
  const sendPrompt = useCallback(
    (prompt: string, outgoingPrompt = prompt) => {
      for (const pane of session.panes) {
        if (pane.included) sendToPane(pane, prompt, outgoingPrompt);
      }
    },
    [session.panes, sendToPane],
  );

  // Restores files the agent changed during the pane's latest reply.
  const rollbackTurn = useCallback(
    async (paneId: string) => {
      const turn = agentTurns[paneId];
      if (!turn || streamState.current.has(paneId)) return;
      try {
        const restored = await window.zenith.projects.rollback(turn.turnId);
        setAgentTurns((current) =>
          current[paneId]?.turnId === turn.turnId
            ? { ...current, [paneId]: { ...turn, rolledBack: restored } }
            : current,
        );
      } catch (error: unknown) {
        updatePane(paneId, {
          lastError: `Could not undo file changes: ${describeSendError(error)}`,
        });
      }
    },
    [agentTurns, updatePane],
  );

  // Restores one file the pane's latest reply changed, without touching its other files.
  const rollbackFile = useCallback(
    async (paneId: string, path: string): Promise<boolean> => {
      const turn = agentTurns[paneId];
      const pane = session.panes.find((candidate) => candidate.id === paneId);
      if (!turn || !pane?.projectPath || streamState.current.has(paneId)) return false;
      try {
        return await window.zenith.projects.rollbackFile(turn.turnId, pane.projectPath, path);
      } catch (error: unknown) {
        updatePane(paneId, {
          lastError: `Could not undo file changes: ${describeSendError(error)}`,
        });
        return false;
      }
    },
    [agentTurns, session.panes, updatePane],
  );

  // Puts the project back as it was before messageId ran, undoing every later reply newest first,
  // and cuts the conversation back to before it. Returns the prompt so it can be edited and resent.
  const restoreTo = useCallback(
    async (paneId: string, messageId: string): Promise<string | undefined> => {
      if (streamState.current.has(paneId)) return undefined;
      const pane = session.panes.find((candidate) => candidate.id === paneId);
      const index = pane?.messages.findIndex((message) => message.id === messageId) ?? -1;
      if (!pane || index < 0) return undefined;
      const turnIds = pane.messages
        .slice(index)
        .filter((message) => message.role === "user")
        .map((message) => message.id)
        .reverse();
      try {
        for (const turnId of turnIds) await window.zenith.projects.rollback(turnId);
      } catch (error: unknown) {
        updatePane(paneId, { lastError: `Could not restore files: ${describeSendError(error)}` });
        return undefined;
      }
      setAgentTurns((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== paneId)),
      );
      updatePane(paneId, { messages: pane.messages.slice(0, index), lastError: null });
      return pane.messages[index]?.content;
    },
    [session.panes, updatePane],
  );

  const abortAll = useCallback(() => {
    for (const paneId of [...streamState.current.keys()]) abortPane(paneId);
  }, [abortPane]);

  // Kept current so the end of a reply can send what was waiting, without an effect that watches
  // the streaming set.
  useEffect(() => {
    sendQueued.current = () => {
      const next = queuedRef.current;
      const target = session.panes[0];
      if (!next || !target) return;
      queuedRef.current = null;
      setQueuedPrompt(null);
      sendToPane(target, next.prompt, next.prompt, next.images);
    };
  }, [session.panes, sendToPane]);

  return {
    session,
    setSession,
    streamingPaneIds,
    runningSessions,
    agentTurns,
    notices,
    rollbackTurn,
    rollbackFile,
    compactingPaneIds,
    compactPane,
    synthesize,
    permissions,
    respondPermission,
    addPane,
    removePane,
    updatePane,
    setMemoryText,
    setPersonality,
    sendPrompt,
    sendToPane,
    queuedPrompt,
    queuePrompt,
    cancelQueue,
    retryPane,
    undoPane,
    restoreTo,
    branchPane,
    abortPane,
    abortAll,
    clearAgentCache: () => agentCache.current.clear(),
  };
}

// The pane with a reply's text so far and, once it is done, its token counts.
function withReply(
  pane: PaneState,
  assistantId: string,
  text: string,
  done: boolean,
  reported: TokenUsage | undefined,
  reportedWindow: number | undefined,
): PaneState {
  const messages = [...pane.messages];
  if (text !== "") {
    const last = messages.at(-1);
    if (last?.id === assistantId) {
      messages[messages.length - 1] = { ...last, content: text };
    } else {
      messages.push({ id: assistantId, role: "assistant", content: text });
    }
  }
  if (!done) return { ...pane, messages };
  const contextWindow = reportedWindow ?? pane.contextWindow;
  // Prefer the tool's real token counts; fall back to the estimate when none arrive.
  return reported
    ? {
        ...pane,
        messages,
        contextWindow,
        promptTokens: reported.inputTokens,
        completionTokens: reported.outputTokens,
      }
    : { ...pane, messages, contextWindow, completionTokens: estimateTokens(text) };
}

async function saveFinishedReply(
  sessionId: string,
  paneId: string,
  update: (pane: PaneState) => PaneState,
): Promise<void> {
  const saved = await window.zenith.sessions.load(sessionId);
  if (!saved) return;
  await persistSession({
    ...saved,
    panes: saved.panes.map((pane) => (pane.id === paneId ? update(pane) : pane)),
  });
}

export async function persistSession(session: SessionState): Promise<void> {
  await window.zenith.sessions.save({ ...session, updatedAt: Date.now() });
}

export async function loadSessionOrCreate(id: string): Promise<SessionState> {
  const existing = await window.zenith.sessions.load(id);
  return existing ?? createEmptySession(id);
}
