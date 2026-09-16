import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { BoardCard, BoardStatus } from "../shared/types";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { cn } from "./lib/utils";

const COLUMNS: { status: BoardStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "In progress" },
  { status: "done", label: "Done" },
];

// Project board: cards per project folder, filled by agents' task lists and by the user.
export function BoardDialog(props: { projectPath: string | null; onClose(): void }) {
  const { projectPath } = props;
  const [cards, setCards] = useState<{ projectPath: string; items: BoardCard[] }>({
    projectPath: "",
    items: [],
  });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    window.zenith.projects
      .listCards(projectPath)
      .then((items) => {
        if (!cancelled) setCards({ projectPath, items });
      })
      .catch((caught: unknown) => console.error("Failed to load the board:", caught));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const items = cards.projectPath === projectPath ? cards.items : [];

  function apply(update: Promise<BoardCard[]>) {
    if (!projectPath) return;
    update
      .then((next) => {
        setCards({ projectPath, items: next });
        setError("");
      })
      .catch(() => setError("Could not update the board."));
  }

  function add() {
    const title = draft.trim();
    if (!title || !projectPath) return;
    apply(window.zenith.projects.saveCard({ projectPath, title, status: "todo" }));
    setDraft("");
  }

  function move(card: BoardCard, step: 1 | -1) {
    const index = COLUMNS.findIndex((column) => column.status === card.status);
    const next = COLUMNS[index + step];
    if (next) apply(window.zenith.projects.saveCard({ ...card, status: next.status }));
  }

  return (
    <Dialog open={projectPath !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(640px,85vh)] w-[min(960px,calc(100vw-48px))] gap-4">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>Project board</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {projectPath}
          </DialogDescription>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label="New card"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a task… Agents' task lists appear here too."
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={draft.trim() === ""}>
            <Plus />
            Add
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-3">
          {COLUMNS.map((column, columnIndex) => {
            const columnCards = items.filter((card) => card.status === column.status);
            return (
              <section
                key={column.status}
                aria-label={column.label}
                className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2"
              >
                <h3 className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {column.label}
                  <span className="font-mono tabular-nums">{columnCards.length}</span>
                </h3>
                <ul className="flex flex-col gap-1.5 overflow-y-auto">
                  {columnCards.map((card) => (
                    <li
                      key={card.id}
                      className="group flex items-start gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-[13px]"
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 break-words leading-relaxed",
                          card.status === "done" && "text-muted-foreground",
                        )}
                      >
                        {card.title}
                      </span>
                      <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {columnIndex > 0 && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Move "${card.title}" to ${COLUMNS[columnIndex - 1]?.label}`}
                            onClick={() => move(card, -1)}
                          >
                            <ArrowLeft />
                          </Button>
                        )}
                        {columnIndex < COLUMNS.length - 1 && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Move "${card.title}" to ${COLUMNS[columnIndex + 1]?.label}`}
                            onClick={() => move(card, 1)}
                          >
                            <ArrowRight />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete "${card.title}"`}
                          onClick={() =>
                            projectPath &&
                            apply(window.zenith.projects.deleteCard(card.id, projectPath))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
