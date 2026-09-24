import type { Locator } from "@playwright/test";

// Agents name their approval choices differently ("Allow", "Allow once", "Allow for this
// session"); approve just this action where the agent offers that.
export async function approveOnce(scope: Locator): Promise<void> {
  for (const name of [/^Allow$/, /^Allow once$/, /^Allow/]) {
    const button = scope.getByRole("button", { name }).first();
    if (await button.isVisible()) return button.click();
  }
}
