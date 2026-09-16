import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary/60">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex max-w-[260px] flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{props.description}</p>
      </div>
      {props.action}
    </div>
  );
}
