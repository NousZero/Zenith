import type { GateResult } from "./types";

// The follow-up prompt for failing checks, so the findings go back to the agent as they are.
export function gateFixPrompt(gates: readonly GateResult[]): string {
  const failed = gates.filter((gate) => gate.state === "fail");
  if (failed.length === 0) return "";
  const parts = failed.map((gate) => `${gate.label}: ${gate.detail}\n${gate.findings.join("\n")}`);
  return `The checks after your last reply found problems. Fix them, changing as little as possible.\n\n${parts.join("\n\n")}`;
}
