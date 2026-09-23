import { Copy } from "lucide-react";

import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";

export interface CliOutput {
  title: string;
  description: string;
  text: string | null;
}

// Shows what a tool's own command printed, such as Claude Code's /usage.
export function CliOutputDialog(props: { output: CliOutput | null; onClose(): void }) {
  const { output } = props;
  return (
    <Dialog open={output !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(560px,80vh)] w-[min(720px,calc(100vw-48px))] gap-3">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>{output?.title ?? ""}</DialogTitle>
          <DialogDescription>{output?.description ?? ""}</DialogDescription>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed rounded-lg">
          {output?.text ?? "Asking Claude Code…"}
        </pre>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={!output?.text}
            onClick={() => void navigator.clipboard.writeText(output?.text ?? "")}
          >
            <Copy />
            Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
