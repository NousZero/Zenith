import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { composer } from "./support/send-and-approve";

// The stand-in Gemini answers like an account out of quota. The pane offers another assistant,
// which gets the failed prompt and the conversation before it, with nothing retyped. The
// stand-in Claude's chat reply says how many earlier messages it was given.
test("account problem: continue with another assistant, keeping the conversation", async () => {
  const { page, close } = await launchApp({ env: { ZENITH_FAKE_QUOTA: "1" } });
  try {
    const conversation = page.getByRole("region", { name: "Conversation" });
    const provider = page.getByRole("combobox", { name: "Provider" });
    await expect(provider).toContainText("Claude Code");

    await composer(page).fill("First question");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(conversation.getByText("Claude Code read 0 earlier messages.")).toBeVisible();

    await provider.click();
    await page.getByRole("option", { name: "Gemini CLI" }).click();
    await composer(page).fill("Second question");
    await page.getByRole("button", { name: "Send" }).click();

    const alert = conversation.getByRole("alert");
    await expect(alert).toContainText("Your quota will reset");
    await expect(alert).toContainText("It gets this conversation");
    await alert.getByRole("button", { name: "Continue with Claude Code" }).click();

    await expect(conversation.getByText("Claude Code read 2 earlier messages.")).toBeVisible();
    await expect(conversation.getByText("Second question")).toHaveCount(1);
    await expect(alert).toHaveCount(0);
    await expect(provider).toContainText("Claude Code");
  } finally {
    await close();
  }
});
