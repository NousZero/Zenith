// Extras are features outside the core loop (pick a folder, ask, watch, review, keep or undo).
// Settings > General > Extras turns each on or off; every rail item, composer control, menu entry, and
// slash command that belongs to one reads this file instead of deciding for itself.

import { useEffect, useState } from "react";

export type ExtraId = "goals" | "schedule" | "bots" | "dictation" | "screenshot" | "projectBoard";

export const EXTRAS: readonly { id: ExtraId; label: string; description: string }[] = [
  { id: "goals", label: "Goals", description: "Track goals on their own rail page." },
  {
    id: "schedule",
    label: "Scheduled tasks",
    description: "Run a prompt on a schedule while Zenith is open.",
  },
  {
    id: "bots",
    label: "Bots",
    description:
      "Chat with Zenith from Telegram, Discord, Slack, WhatsApp, Signal, or Home Assistant.",
  },
  {
    id: "dictation",
    label: "Dictation",
    description: "Speak a message into the composer instead of typing it.",
  },
  {
    id: "screenshot",
    label: "Screenshot",
    description: "Attach a screenshot of the screen from the composer's + menu.",
  },
  {
    id: "projectBoard",
    label: "Project board",
    description: "A kanban board for the pane's project folder.",
  },
] as const;

const STORAGE_KEY = "zenith.extras";

function readStored(): Partial<Record<ExtraId, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<ExtraId, boolean>>) : {};
  } catch {
    return {};
  }
}

function writeStored(next: Partial<Record<ExtraId, boolean>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The choice still applies for this window.
  }
}

// An extra already in use before this switch existed defaults to on, so nobody loses sight of a
// goal, bot, or scheduled task that's already running.
async function alreadyInUse(id: ExtraId): Promise<boolean> {
  switch (id) {
    case "goals":
      return (await window.zenith.goals.list().catch(() => [])).length > 0;
    case "bots":
      return (await window.zenith.bots.list().catch(() => [])).some((bot) => bot.enabled);
    case "schedule":
      return (await window.zenith.schedule.list().catch(() => [])).length > 0;
    default:
      return false;
  }
}

export function useExtras(): {
  extras: Record<ExtraId, boolean>;
  setExtra(id: ExtraId, enabled: boolean): void;
} {
  const [stored, setStored] = useState(readStored);

  // Extras with no stored choice yet are undecided; resolve each one against alreadyInUse and
  // persist the result so this only runs once per install.
  useEffect(() => {
    const undecided = EXTRAS.filter((extra) => stored[extra.id] === undefined);
    if (undecided.length === 0) return;
    let cancelled = false;
    void Promise.all(
      undecided.map(async (extra) => [extra.id, await alreadyInUse(extra.id)] as const),
    ).then((results) => {
      if (cancelled) return;
      setStored((current) => {
        const next = { ...current };
        for (const [id, inUse] of results) next[id] = inUse;
        writeStored(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Runs once: it only fills in extras that have no stored choice yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setExtra(id: ExtraId, enabled: boolean) {
    setStored((current) => {
      const next = { ...current, [id]: enabled };
      writeStored(next);
      return next;
    });
  }

  const extras = Object.fromEntries(
    EXTRAS.map((extra) => [extra.id, stored[extra.id] ?? false]),
  ) as Record<ExtraId, boolean>;

  return { extras, setExtra };
}
