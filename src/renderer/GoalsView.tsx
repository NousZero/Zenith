import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Goal, GoalStatus } from "../shared/types";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { cn } from "./lib/utils";

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
};

const NEXT_STATUS: Record<GoalStatus, GoalStatus> = {
  active: "paused",
  paused: "done",
  done: "active",
};

function ProgressBar({ value, muted }: { value: number; muted: boolean }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", muted ? "bg-border" : "bg-primary")}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function GoalsView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setGoals(await window.zenith.goals.list());
      setError("");
    } catch {
      setError("Goals could not be loaded.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.zenith.goals
      .list()
      .then((items) => {
        if (!cancelled) {
          setGoals(items);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Goals could not be loaded.");
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      setError("");
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work.");
    }
  };

  const add = async () => {
    if (!title.trim()) return;
    await act(() => window.zenith.goals.create({ title }));
    setTitle("");
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What are you working towards?"
          aria-label="New goal"
        />
        <Button type="submit" size="sm" disabled={!title.trim()}>
          <Plus />
          Add
        </Button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loaded && goals.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No goals yet. Add one above and it will be kept between sessions.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {goals.map((goal) => (
          <li
            key={goal.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className={cn("text-sm", goal.status === "done" && "text-muted-foreground")}>
                {goal.title}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title="Change status"
                  onClick={() =>
                    void act(() =>
                      window.zenith.goals.update(goal.id, {
                        title: goal.title,
                        detail: goal.detail,
                        status: NEXT_STATUS[goal.status],
                        progress: goal.progress,
                      }),
                    )
                  }
                >
                  {STATUS_LABEL[goal.status]}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${goal.title}`}
                  onClick={() => void act(() => window.zenith.goals.remove(goal.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <ProgressBar value={goal.progress} muted={goal.status !== "active"} />
            <input
              type="range"
              className="accent-primary"
              min={0}
              max={100}
              step={5}
              value={goal.progress}
              aria-label={`Progress for ${goal.title}`}
              disabled={goal.status === "done"}
              onChange={(event) =>
                void act(() =>
                  window.zenith.goals.update(goal.id, {
                    title: goal.title,
                    detail: goal.detail,
                    status: goal.status,
                    progress: Number(event.target.value),
                  }),
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
