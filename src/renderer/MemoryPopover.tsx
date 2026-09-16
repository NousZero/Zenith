import { Brain } from "lucide-react";

import { Button } from "./components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Textarea } from "./components/ui/textarea";

export function MemoryPopover(props: {
  memoryText: string;
  enabledPaneCount: number;
  paneCount: number;
  onChange(value: string): void;
}) {
  const hasMemory = props.memoryText.trim() !== "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={hasMemory ? "Memory (set)" : "Memory"}>
          <Brain />
          <span className="@max-[880px]/header:sr-only">Memory</span>
          {hasMemory && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[420px] flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Session memory</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Sent as a system message before each prompt to panes with memory turned on. Currently
            used by {props.enabledPaneCount} of {props.paneCount} panes.
          </p>
        </div>
        <Textarea
          aria-label="Session memory"
          autoFocus
          rows={8}
          value={props.memoryText}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="e.g. Project uses TypeScript strict mode. Prefer concise answers with code."
          className="resize-y"
        />
        <p className="text-right font-mono text-[11px] text-muted-foreground">
          {props.memoryText.length} chars
        </p>
      </PopoverContent>
    </Popover>
  );
}
