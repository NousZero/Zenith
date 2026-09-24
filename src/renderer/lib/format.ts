export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count >= 1_000_000) return `${Number((count / 1_000_000).toFixed(1))}M`;
  const thousands = count / 1000;
  return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// What to tell the user when some worktrees could not be removed, so none is left silently.
export function leftoverNotice(leftovers: readonly string[]): string {
  if (leftovers.length === 0) return "";
  return ` Couldn't remove ${leftovers.join(", ")}. Remove ${leftovers.length === 1 ? "it" : "them"} with "git worktree remove", or delete the folder and run "git worktree prune".`;
}
