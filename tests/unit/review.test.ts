import { describe, expect, it } from "vitest";

import { REVIEW_SYSTEM, reviewPrompt, reviewVerdict } from "../../src/main/review";

describe("review", () => {
  it("asks for a verdict line and reads it back, whatever the case or spacing", () => {
    expect(REVIEW_SYSTEM).toContain("VERDICT: clean");
    expect(reviewVerdict("VERDICT: clean")).toBe("clean");
    expect(reviewVerdict("Sure!\n\n  verdict: Findings  \n- SEVERITY: high")).toBe("findings");
  });

  it("calls anything else unclear, so a confused answer never reads as approval", () => {
    expect(reviewVerdict("Looks fine to me.")).toBe("unclear");
    expect(reviewVerdict("VERDICT: maybe")).toBe("unclear");
    expect(reviewVerdict("")).toBe("unclear");
  });

  it("sends the patch and nothing about the conversation", () => {
    const prompt = reviewPrompt("diff --git a/a.ts b/a.ts\n+const x = 1;");
    expect(prompt).toContain("+const x = 1;");
    expect(prompt.startsWith("Review this patch:")).toBe(true);
  });
});
