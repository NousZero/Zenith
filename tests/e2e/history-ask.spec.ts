import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";

const openKey = process.platform === "darwin" ? "Meta+k" : "Control+k";

test("ask: any ready assistant can answer, and the choice is remembered", async () => {
  const { page, close } = await launchApp();
  try {
    await expect(page.getByText("What are we working on?")).toBeVisible();
    await page.keyboard.press(openKey);
    const history = page.getByRole("dialog", { name: "History" });
    await history.getByRole("tab", { name: "Ask" }).click();

    // Assistants that no pane uses are offered too, not only the open pane's.
    const assistant = history.getByRole("combobox", { name: "Assistant that answers" });
    await expect(assistant.getByRole("option", { name: "Claude Code" })).toHaveCount(1);
    await expect(assistant.getByRole("option", { name: "Gemini CLI" })).toHaveCount(1);

    await assistant.selectOption({ label: "Gemini CLI" });
    await expect(history.getByRole("combobox", { name: "Model that answers" })).toBeEnabled();
    await history.getByRole("textbox", { name: "Question about your history" }).fill("hello");
    await history.getByRole("button", { name: "Ask", exact: true }).click();
    // The stand-in Gemini always answers with its review verdict.
    await expect(history.getByText("VERDICT: findings")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(history).not.toBeVisible();
    await page.keyboard.press(openKey);
    await history.getByRole("tab", { name: "Ask" }).click();
    await expect(history.getByRole("combobox", { name: "Assistant that answers" })).toHaveValue(
      "gemini-cli",
    );
  } finally {
    await close();
  }
});
