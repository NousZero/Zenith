import { expect, test, type ElectronApplication } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { launchApp } from "./support/electron-app";

// Runs a script in the browser tab showing `url`, as if the person had clicked to run it, since
// the page is a native view the test cannot reach through the window.
async function runInPage(app: ElectronApplication, url: string, script: string): Promise<void> {
  await app.evaluate(
    async ({ webContents }, [pageUrl, source]) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === pageUrl);
      if (!contents) throw new Error(`No page at ${pageUrl}`);
      await contents.executeJavaScript(source, true);
    },
    [url, script] as const,
  );
}

// Presses Cmd+<key> (Ctrl elsewhere) inside the page at `url`, where the window never sees it.
async function pressInPage(app: ElectronApplication, url: string, key: string): Promise<void> {
  await app.evaluate(
    ({ webContents }, [pageUrl, keyCode]) => {
      const contents = webContents.getAllWebContents().find((item) => item.getURL() === pageUrl);
      if (!contents) throw new Error(`No page at ${pageUrl}`);
      const modifiers = [process.platform === "darwin" ? "meta" : "control"] as (
        "meta" | "control"
      )[];
      contents.focus();
      contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    },
    [url, key] as const,
  );
}

let server: Server;
let origin = "";

// Two tiny pages, so navigating between them gives the browser a history to walk, and a page of
// links that open new windows.
const LINKS = `<!doctype html><title>Links</title>
<a id="new" href="/two" target="_blank">Two in a new tab</a>
<a id="file" href="file:///etc/passwd" target="_blank">A file in a new tab</a>`;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const name = request.url === "/two" ? "Two" : "One";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      request.url === "/links"
        ? LINKS
        : `<!doctype html><title>Page ${name}</title><h1>${name}</h1>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("browser: loads pages from the address field and walks back and forward", async () => {
  const { page, close } = await launchApp();
  try {
    const rail = page.getByRole("navigation", { name: "Primary activity" });
    await rail.getByRole("button", { name: "Browser", exact: true }).click();
    const address = page.getByRole("textbox", { name: "Address" });
    const location = page.getByRole("navigation", { name: "Location" });
    const back = page.getByRole("button", { name: "Back", exact: true });
    const forward = page.getByRole("button", { name: "Forward", exact: true });

    await address.fill(`${origin}/one`);
    await address.press("Enter");
    await expect(location).toContainText("Page One");
    await expect(address).toHaveValue(`${origin}/one`);
    await expect(back).toBeDisabled();

    await address.fill(`${origin}/two`);
    await address.press("Enter");
    await expect(location).toContainText("Page Two");
    await expect(address).toHaveValue(`${origin}/two`);
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();

    await back.click();
    await expect(location).toContainText("Page One");
    await expect(address).toHaveValue(`${origin}/one`);
    await expect(forward).toBeEnabled();

    await forward.click();
    await expect(location).toContainText("Page Two");
    await expect(address).toHaveValue(`${origin}/two`);

    // Leaving the page and coming back finds it where it was.
    await rail.getByRole("button", { name: "Files", exact: true }).click();
    await expect(address).not.toBeVisible();
    await rail.getByRole("button", { name: "Browser", exact: true }).click();
    await expect(address).toHaveValue(`${origin}/two`);
    await expect(back).toBeEnabled();

    // Schemes other than http and https are refused, and the page stays put.
    await address.fill("file:///etc/passwd");
    await address.press("Enter");
    await expect(page.getByText("Only http and https pages can be opened")).toBeVisible();
    await expect(address).toHaveValue(`${origin}/two`);
  } finally {
    await close();
  }
});

test("browser: keeps several pages open in tabs, and brings them back after a restart", async () => {
  let { app, page, userDataDir, close } = await launchApp();
  try {
    const rail = page.getByRole("navigation", { name: "Primary activity" });
    await rail.getByRole("button", { name: "Browser", exact: true }).click();
    const address = page.getByRole("textbox", { name: "Address" });
    const location = page.getByRole("navigation", { name: "Location" });
    const tabs = page.getByRole("tablist", { name: "Open pages" }).getByRole("tab");

    await address.fill(`${origin}/one`);
    await address.press("Enter");
    await expect(location).toContainText("Page One");

    // A new tab is blank, with the address field ready to type in.
    await page.getByRole("button", { name: "New tab", exact: true }).click();
    await expect(tabs).toHaveCount(2);
    await expect(address).toBeFocused();
    await expect(address).toHaveValue("");
    await address.fill(`${origin}/two`);
    await address.press("Enter");
    await expect(location).toContainText("Page Two");

    // Switching tabs brings back each page's title and address.
    await tabs.filter({ hasText: "Page One" }).click();
    await expect(location).toContainText("Page One");
    await expect(address).toHaveValue(`${origin}/one`);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await tabs.filter({ hasText: "Page Two" }).click();
    await expect(location).toContainText("Page Two");
    await expect(address).toHaveValue(`${origin}/two`);

    // Closing the open tab shows its neighbour.
    await page.getByRole("button", { name: "Close Page Two", exact: true }).click();
    await expect(tabs).toHaveCount(1);
    await expect(location).toContainText("Page One");

    // The tab keys work in the window, and inside the page, where the window never sees them.
    await page.keyboard.press("ControlOrMeta+t");
    await expect(tabs).toHaveCount(2);
    await expect(address).toBeFocused();
    await page.keyboard.press("ControlOrMeta+w");
    await expect(tabs).toHaveCount(1);
    await pressInPage(app, `${origin}/one`, "t");
    await expect(tabs).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+w");
    await expect(tabs).toHaveCount(1);
    await pressInPage(app, `${origin}/one`, "l");
    await expect(address).toBeFocused();

    // A link that opens a new window opens a tab beside its own; a file: one opens nothing.
    await address.fill(`${origin}/links`);
    await address.press("Enter");
    await expect(location).toContainText("Links");
    await runInPage(
      app,
      `${origin}/links`,
      "document.getElementById('file').click(); document.getElementById('new').click();",
    );
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(location).toContainText("Page Two");
    await expect(address).toHaveValue(`${origin}/two`);

    // A page opening windows in a loop gets one tab: the new tab takes the focus from its opener.
    await tabs.filter({ hasText: "Links" }).click();
    await expect(location).toContainText("Links");
    await runInPage(app, `${origin}/links`, "for (let i = 0; i < 5; i++) window.open('/one');");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(1)).toHaveText("Page One");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

    // After a restart the tabs come back in order, with the same one open.
    await app.close();
    ({ app, page, userDataDir, close } = await launchApp({ userDataDir }));
    await page
      .getByRole("navigation", { name: "Primary activity" })
      .getByRole("button", { name: "Browser", exact: true })
      .click();
    const restored = page.getByRole("tablist", { name: "Open pages" }).getByRole("tab");
    await expect(restored).toHaveCount(3);
    await expect(restored.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("navigation", { name: "Location" })).toContainText("Page One");
    // The others load when first shown.
    await restored.nth(2).click();
    await expect(page.getByRole("navigation", { name: "Location" })).toContainText("Page Two");
  } finally {
    await close();
  }
});
