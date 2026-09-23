import { useEffect, useState } from "react";

import type { ContextSnapshot } from "../shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { formatTokens } from "./lib/format";
import { DEFAULT_CLI_MODEL_ID, providerMeta } from "./providers";

// Shows what the pane's last request carried to the model, section by section.
export function ContextDialog(props: { paneId: string | null; onClose(): void }) {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null | undefined>(undefined);

  useEffect(() => {
    if (!props.paneId) return;
    let cancelled = false;
    window.zenith.chat
      .context(props.paneId)
      .then((value) => {
        if (!cancelled) setSnapshot(value);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.paneId]);

  const model = snapshot
    ? `${providerMeta(snapshot.providerId).label}${snapshot.modelId !== DEFAULT_CLI_MODEL_ID ? ` · ${snapshot.modelId}` : ""}`
    : "";

  return (
    <Dialog
      open={props.paneId !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
          setSnapshot(undefined);
        }
      }}
    >
      <DialogContent className="h-[min(720px,88vh)] w-[min(820px,calc(100vw-48px))] gap-3">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>What the model saw</DialogTitle>
          <DialogDescription>
            {snapshot
              ? `The last request to ${model}, sent ${new Date(snapshot.at).toLocaleTimeString()}: about ${formatTokens(snapshot.totalTokens)} tokens from Zenith.`
              : "Everything Zenith sent with the last message in this conversation."}
          </DialogDescription>
        </div>
        {snapshot === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : snapshot === null ? (
          <p className="text-xs text-muted-foreground">
            Nothing yet. Send a message, then open this again.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {snapshot.note && (
              <p className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground rounded-lg">
                {snapshot.note}
              </p>
            )}
            {snapshot.sections.map((item, index) => (
              <details
                key={`${index}-${item.label}`}
                open={index === 0}
                className="border border-border bg-card rounded-lg"
              >
                <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    ~{formatTokens(item.tokens)} tokens
                  </span>
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
                  {item.text}
                </pre>
              </details>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
