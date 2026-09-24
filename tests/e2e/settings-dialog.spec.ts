import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { composer } from "./support/send-and-approve";

test("settings: opens from the rail as a sheet over the workspace, and Cmd+, reopens it", async () => {
  const { page, close } = await launchApp();
  try {
    await expect(page.getByText("What are we working on?")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary activity" })
      .getByRole("button", { name: /^Settings/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("tab", { name: "Safety" }).click();
    await expect(dialog.getByRole("heading", { name: "Activity record" })).toBeVisible();

    // Closing the sheet leaves the workspace as it was underneath.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("What are we working on?")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(dialog).toBeVisible();
  } finally {
    await close();
  }
});

test("settings: /library lands on Agent behaviour, Skills", async () => {
  const { page, close } = await launchApp();
  try {
    await composer(page).fill("/library");
    await composer(page).press("Enter");

    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog.getByRole("tab", { name: "Agent behaviour" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(dialog.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } finally {
    await close();
  }
});
