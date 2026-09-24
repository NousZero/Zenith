import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { launchApp } from "./support/electron-app";

let server: Server;
let origin = "";

// Two tiny pages, so navigating between them gives the browser a history to walk.
test.beforeAll(async () => {
  server = createServer((request, response) => {
    const name = request.url === "/two" ? "Two" : "One";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><title>Page ${name}</title><h1>${name}</h1>`);
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
