import type { ChatChunk, SendMessageRequest } from "../../shared/types";

interface KeptSession {
  turnId: string;
  sessionId: string;
  setup: string;
}

// The agent's own session from each pane's last clean turn, so the next turn can continue it and
// send only the new message instead of the whole transcript. In memory only: after a restart every
// pane starts over with the transcript.
export function createAgentSessions() {
  const kept = new Map<string, KeptSession>();
  return {
    // Only a pane's turns are kept; one-off requests (compaction, bots) have no pane to continue.
    tracks(request: SendMessageRequest): boolean {
      return request.conversationId !== undefined && request.turnId !== undefined;
    },

    // The session to continue: the window vouches that the pane is unchanged since the turn that
    // left it (resumeFrom), and the setup — model, folder, instructions — is the same. The entry
    // is forgotten either way, because once another turn starts the agent's session no longer
    // matches the pane until that turn ends cleanly and is kept again.
    take(request: SendMessageRequest, setup: string): string | undefined {
      if (request.conversationId === undefined) return undefined;
      const entry = kept.get(request.conversationId);
      kept.delete(request.conversationId);
      return entry && entry.turnId === request.resumeFrom && entry.setup === setup
        ? entry.sessionId
        : undefined;
    },

    keep(request: SendMessageRequest, setup: string, sessionId: string): void {
      if (request.conversationId === undefined || request.turnId === undefined) return;
      kept.set(request.conversationId, { turnId: request.turnId, sessionId, setup });
    },
  };
}

export type AgentSessions = ReturnType<typeof createAgentSessions>;

// Runs a turn in the agent's own session, and if that fails before anything reached the pane
// (the session is gone, the resume was refused, the process died), runs the same turn again with
// the whole transcript, so continuing a session never silently loses the conversation.
export async function* resumeOrReplay(
  resume: (() => AsyncIterable<ChatChunk>) | undefined,
  replay: () => AsyncIterable<ChatChunk>,
  signal?: AbortSignal,
): AsyncIterable<ChatChunk> {
  if (resume) {
    let shown = false;
    try {
      for await (const chunk of resume()) {
        shown ||= chunk.delta !== "" || chunk.activity !== undefined || chunk.todos !== undefined;
        yield chunk;
      }
      return;
    } catch (error) {
      if (shown || signal?.aborted) throw error;
      console.warn("Continuing the agent's session failed; sending the whole conversation.", error);
    }
  }
  yield* replay();
}
