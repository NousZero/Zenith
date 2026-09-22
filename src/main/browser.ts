import { BrowserWindow } from "electron";

// Pages the agent drives. Electron already ships Chromium, so a hardened BrowserWindow gives
// navigation, reading, and clicking without adding a browser automation dependency.
//
// Everything these windows load is untrusted: they render whatever is on the open web. So they get
// no preload and no Node, they may not open windows, download files, or be granted camera,
// microphone or location, and they may only visit http and https. Whatever comes back out of a
// page is data the model reads, never instructions it should follow.

const MAX_TEXT_CHARS = 30_000;
const ACTION_TIMEOUT_MS = 15_000;

export interface BrowserEvents {
  closed(id: string): void;
}

export interface PageSummary {
  id: string;
  title: string;
  url: string;
}

function requireWebUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Not a valid URL: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http and https pages can be opened, not ${parsed.protocol}`);
  }
  return parsed.toString();
}

function clip(value: string): string {
  return value.length > MAX_TEXT_CHARS
    ? `${value.slice(0, MAX_TEXT_CHARS)}\n… output cut at ${MAX_TEXT_CHARS} characters`
    : value;
}

// A selector is interpolated into page script, so it must not be able to close out of its string.
function quoteSelector(selector: string): string {
  if (!selector.trim()) throw new Error("selector must not be empty.");
  return JSON.stringify(selector);
}

export function createBrowser(events: BrowserEvents) {
  const pages = new Map<string, BrowserWindow>();
  let counter = 0;

  function get(id: string): BrowserWindow {
    const page = pages.get(id);
    if (!page || page.isDestroyed()) throw new Error(`No open page with id ${id}.`);
    return page;
  }

  // Returns the value of the expression, or throws with the page's own error message.
  async function run(id: string, expression: string): Promise<unknown> {
    const page = get(id);
    const result = await Promise.race([
      page.webContents.executeJavaScript(expression, true),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("The page did not respond in time.")), ACTION_TIMEOUT_MS),
      ),
    ]);
    return result;
  }

  return {
    async open(url: string, background = true): Promise<PageSummary> {
      const target = requireWebUrl(url);
      const id = `page-${++counter}`;
      const page = new BrowserWindow({
        show: !background,
        width: 1280,
        height: 900,
        webPreferences: {
          allowRunningInsecureContent: false,
          contextIsolation: true,
          experimentalFeatures: false,
          navigateOnDragDrop: false,
          nodeIntegration: false,
          plugins: false,
          sandbox: true,
          spellcheck: false,
          webSecurity: true,
          webviewTag: false,
        },
      });

      page.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      page.webContents.on("will-attach-webview", (event) => event.preventDefault());
      page.webContents.session.on("will-download", (event) => event.preventDefault());
      page.webContents.session.setPermissionCheckHandler(() => false);
      page.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      page.webContents.on("will-navigate", (event, next) => {
        if (!next.startsWith("http://") && !next.startsWith("https://")) event.preventDefault();
      });
      page.on("closed", () => {
        pages.delete(id);
        events.closed(id);
      });

      pages.set(id, page);
      await page.loadURL(target);
      return { id, title: page.webContents.getTitle(), url: page.webContents.getURL() };
    },

    async navigate(id: string, url: string): Promise<PageSummary> {
      const page = get(id);
      await page.loadURL(requireWebUrl(url));
      return { id, title: page.webContents.getTitle(), url: page.webContents.getURL() };
    },

    async readPage(id: string): Promise<string> {
      const page = get(id);
      const text = await run(id, "document.body ? document.body.innerText : ''");
      return clip(
        `${page.webContents.getTitle()}\n${page.webContents.getURL()}\n\n${String(text ?? "")}`,
      );
    },

    async click(id: string, selector: string): Promise<string> {
      const found = await run(
        id,
        `(() => { const el = document.querySelector(${quoteSelector(selector)});
          if (!el) return false;
          el.scrollIntoView({ block: "center" });
          el.click();
          return true; })()`,
      );
      if (found !== true) throw new Error(`Nothing on the page matches ${selector}`);
      return `Clicked ${selector}`;
    },

    async fill(id: string, fields: Record<string, string>): Promise<string> {
      const entries = Object.entries(fields);
      if (entries.length === 0) throw new Error("fields must not be empty.");
      const filled: string[] = [];
      for (const [selector, value] of entries) {
        const ok = await run(
          id,
          `(() => { const el = document.querySelector(${quoteSelector(selector)});
            if (!el) return false;
            el.focus();
            el.value = ${JSON.stringify(String(value))};
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true; })()`,
        );
        if (ok !== true) throw new Error(`Nothing on the page matches ${selector}`);
        filled.push(selector);
      }
      return `Filled ${filled.join(", ")}`;
    },

    async evaluate(id: string, script: string): Promise<string> {
      if (!script.trim()) throw new Error("script must not be empty.");
      const value = await run(id, `(() => { ${script} })()`);
      if (value === undefined) return "undefined";
      try {
        return clip(typeof value === "string" ? value : JSON.stringify(value));
      } catch {
        return clip(String(value));
      }
    },

    list(): PageSummary[] {
      return [...pages.entries()]
        .filter(([, page]) => !page.isDestroyed())
        .map(([id, page]) => ({
          id,
          title: page.webContents.getTitle(),
          url: page.webContents.getURL(),
        }));
    },

    close(id: string): void {
      const page = pages.get(id);
      pages.delete(id);
      if (page && !page.isDestroyed()) page.destroy();
    },

    closeAll(): void {
      for (const page of pages.values()) if (!page.isDestroyed()) page.destroy();
      pages.clear();
    },
  };
}

export type Browser = ReturnType<typeof createBrowser>;
