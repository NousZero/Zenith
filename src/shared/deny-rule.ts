import type { PermissionRequest } from "./types";

// A rule that covers a request the user keeps denying. Commands are matched by their first two
// words ("git push*"), everything else by exactly what it named, so a rule never widens silently.
export function denyRuleFor(request: PermissionRequest): string | undefined {
  const { tool, subject } = request;
  if (!tool || !subject) return undefined;
  if (tool !== "Bash") return `deny ${tool} ${subject}`;
  const words = subject.trim().split(/\s+/).slice(0, 2).join(" ");
  return words === "" ? undefined : `deny Bash ${words}*`;
}

// The option id that denies this request, for answering it while saving a rule.
export function denyOptionId(request: PermissionRequest): string | null {
  return request.options.find((option) => option.kind.startsWith("reject"))?.id ?? null;
}
