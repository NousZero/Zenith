import { useState } from "react";

import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";

type Target = "profile" | "session";

const MAX_PREFILL_CHARS = 400;

function RememberForm(props: {
  text: string;
  onClose(): void;
  onSave(fact: string, target: Target): Promise<void>;
}) {
  const [fact, setFact] = useState(props.text.trim().slice(0, MAX_PREFILL_CHARS));
  const [target, setTarget] = useState<Target>("profile");
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        props
          .onSave(fact, target)
          .then(props.onClose)
          .catch((caught: unknown) =>
            setError(caught instanceof Error ? caught.message : String(caught)),
          );
      }}
    >
      <Textarea
        autoFocus
        aria-label="What to remember"
        rows={4}
        value={fact}
        onChange={(event) => setFact(event.target.value)}
        className="resize-y"
      />
      <div
        role="radiogroup"
        aria-label="Where to remember it"
        className="flex flex-col gap-1.5 text-[13px]"
      >
        {(
          [
            ["profile", "About you (USER.md)", "Every conversation in every session sees it."],
            ["session", "This session's memory", "Panes with memory turned on see it."],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={target === value}
            onClick={() => setTarget(value)}
            className={cn(
              "flex cursor-pointer flex-col items-start rounded-md border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              target === value
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-accent/50",
            )}
          >
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={fact.trim() === ""}>
          Remember
        </Button>
      </div>
    </form>
  );
}

export function RememberDialog(props: {
  text: string | null;
  onClose(): void;
  onSave(fact: string, target: Target): Promise<void>;
}) {
  return (
    <Dialog open={props.text !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remember</DialogTitle>
          <DialogDescription>
            Shorten this to the fact worth keeping. It is added as a bullet you can edit later in
            Settings or the Memory popover.
          </DialogDescription>
        </DialogHeader>
        {props.text !== null && (
          <RememberForm text={props.text} onClose={props.onClose} onSave={props.onSave} />
        )}
      </DialogContent>
    </Dialog>
  );
}
