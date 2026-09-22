import { describe, expect, it } from "vitest";

import { runBrowserTool, type BrowserTools } from "../../src/main/agent/native-agent";

function fakeBrowser(overrides: Partial<BrowserTools> = {}): BrowserTools {
  const pages = [{ id: "page-1", title: "Example", url: "https://example.com/" }];
  return {
    async open(url, background) {
      return { id: "page-1", title: `opened ${url} bg=${String(background)}`, url };
    },
    async navigate(id, url) {
      return { id, title: "moved", url };
    },
    async readPage(id) {
      return `text of ${id}`;
    },
    async click(id, selector) {
      return `clicked ${selector} on ${id}`;
    },
    async fill(id, fields) {
      return `filled ${Object.keys(fields).join(",")} on ${id}`;
    },
    async evaluate(id, script) {
      return `evaluated ${script} on ${id}`;
    },
    list() {
      return pages;
    },
    close() {},
    ...overrides,
  };
}

describe("runBrowserTool", () => {
  it("reports that browsing is unavailable when no browser is wired up", async () => {
    await expect(runBrowserTool(undefined, "BrowserRead", { page_id: "page-1" })).rejects.toThrow(
      /Browsing isn't available/,
    );
  });

  it("defaults BrowserOpen to a background window and passes false through", async () => {
    await expect(
      runBrowserTool(fakeBrowser(), "BrowserOpen", { url: "https://a.test" }),
    ).resolves.toContain("bg=true");
    await expect(
      runBrowserTool(fakeBrowser(), "BrowserOpen", { url: "https://a.test", background: false }),
    ).resolves.toContain("bg=false");
  });

  it("rejects missing or blank required arguments", async () => {
    await expect(runBrowserTool(fakeBrowser(), "BrowserOpen", {})).rejects.toThrow(
      /url is required/,
    );
    await expect(
      runBrowserTool(fakeBrowser(), "BrowserClick", { page_id: "page-1", selector: "   " }),
    ).rejects.toThrow(/selector is required/);
  });

  it("requires fields to be an object of selector to value", async () => {
    await expect(
      runBrowserTool(fakeBrowser(), "BrowserFill", { page_id: "page-1", fields: ["a"] }),
    ).rejects.toThrow(/fields must be an object/);
    await expect(
      runBrowserTool(fakeBrowser(), "BrowserFill", {
        page_id: "page-1",
        fields: { "#email": "a@b.test" },
      }),
    ).resolves.toContain("#email");
  });

  it("lists open pages and says so when there are none", async () => {
    await expect(runBrowserTool(fakeBrowser(), "BrowserTabs", {})).resolves.toContain("page-1");
    await expect(runBrowserTool(fakeBrowser({ list: () => [] }), "BrowserTabs", {})).resolves.toBe(
      "No pages are open.",
    );
  });

  it("turns a page failure into a tool error the model can read", async () => {
    const browser = fakeBrowser({
      click: async () => {
        throw new Error("Nothing on the page matches .missing");
      },
    });
    await expect(
      runBrowserTool(browser, "BrowserClick", { page_id: "page-1", selector: ".missing" }),
    ).rejects.toThrow(/Nothing on the page matches/);
  });
});
