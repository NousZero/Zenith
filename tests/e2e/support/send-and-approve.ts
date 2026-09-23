import { expect, type Page } from "@playwright/test";

// Distinct from the stand-in Claude's scripted todo/activity text ("Add notes to the README",
// "Run npm test…") so locators for the sent prompt never collide with the agent's own output.
export const PROMPT = "Please look at this project and add some notes.";

export function composer(page: Page) {
  return page.locator("#composer-input");
}

// The approval card also mirrors into the bottom panel dock; scope to the main conversation so
// locators resolve to exactly one element regardless of whether the dock is open.
export function approvalCard(page: Page) {
  return page.getByRole("region", { name: "Conversation" }).getByRole("alertdialog", {
    name: "Agent approval",
  });
}

export function reviewBar(page: Page) {
  return page.getByRole("region", { name: "Review changes" });
}

// Types the shared prompt, sends it, and waits for the stand-in Claude's approval card for the
// README.md edit to appear (but does not respond to it).
export async function sendPrompt(page: Page, prompt: string = PROMPT): Promise<void> {
  await composer(page).fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(approvalCard(page)).toBeVisible();
  await expect(approvalCard(page).getByText("Edit README.md")).toBeVisible();
}

// Sends the shared prompt, clicks Allow, and waits for the review bar to confirm the turn
// finished and README.md was recorded as changed.
export async function sendAndApprove(page: Page, prompt: string = PROMPT): Promise<void> {
  await sendPrompt(page, prompt);
  await approvalCard(page).getByRole("button", { name: "Allow", exact: true }).click();
  await expect(reviewBar(page)).toBeVisible();
  await expect(reviewBar(page).getByText("README.md")).toBeVisible();
}
