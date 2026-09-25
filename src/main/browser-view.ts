import { session, shell, WebContentsView, type BrowserWindow, type WebContents } from "electron";
import { randomUUID } from "node:crypto";

import { addressToUrl, isAllowedPageUrl } from "../shared/browser-address";
import { browserShortcut, MAX_BROWSER_TABS, restorableTabs } from "../shared/browser-tabs";
import type { BrowserTabState } from "../shared/types";

// The built-in browser the person uses, as opposed to the pages agents drive in `browser.ts`.
//
// Each tab is one native view drawn over the main window, since `<webview>` stays disabled, and
// only the open tab's view is visible. What they show is the open web, so every tab is treated
// like `browser.ts` treats its pages: one shared session of its own, so sites never see Zenith's
// cookies or storage; no preload and no Node; only http and https; no camera, microphone,
// location or other permissions; and no file saved without a save dialog.

const PARTITION = "persist:zenith-browser";
// Chromium reports a navigation replaced by a newer one as aborted; that is not a failure.
const ERR_ABORTED = -3;

type Bounds = { x: number; y: number; width: number; height: number };

type Tab = {
  id: string;
  // Made on the tab's first page, so a blank or restored tab costs nothing until it is shown.
  view: WebContentsView | null;
  // The address the tab loads when first shown, and shows until its page has one of its own.
  url: string;
  error: string | null;
};

function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Bounds must be four numbers.");
  }
  return Math.max(0, Math.round(value));
}

function installSessionGuards(): void {
  const browserSession = session.fromPartition(PARTITION);
  browserSession.setPermissionCheckHandler(() => false);
  // This also refuses links into other apps (mailto:, zoommtg: and so on), which Electron asks
  // about as the "openExternal" permission.
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  // Without a save path Electron asks where to save, so a site can never drop a file silently.
  browserSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({ title: "Save download" });
  });
}

export function createBrowserView() {
  installSessionGuards();

  let tabs: Tab[] = [];
  let activeId: string | null = null;
  let owner: BrowserWindow | null = null;
  let bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  let visible = false;

  function contentsOf(tab: Tab | undefined): WebContents | null {
    return tab?.view && !tab.view.webContents.isDestroyed() ? tab.view.webContents : null;
  }

  function find(tabId: unknown): Tab | undefined {
    return tabs.find((tab) => tab.id === tabId);
  }

  function state(tab: Tab): BrowserTabState {
    const contents = contentsOf(tab);
    return {
      id: tab.id,
      url: contents?.getURL() || tab.url,
      title: contents?.getTitle() ?? "",
      canGoBack: contents?.navigationHistory.canGoBack() ?? false,
      canGoForward: contents?.navigationHistory.canGoForward() ?? false,
      loading: contents?.isLoading() ?? false,
      error: tab.error,
    };
  }

  function publish(): void {
    if (!owner || owner.isDestroyed()) return;
    owner.webContents.send("browser:state", { tabs: tabs.map(state), activeId });
  }

  function closeView(tab: Tab): void {
    if (!tab.view) return;
    if (owner && !owner.isDestroyed()) owner.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    tab.view = null;
  }

  function destroy(): void {
    for (const tab of tabs) closeView(tab);
    tabs = [];
    activeId = null;
    owner = null;
  }

  function load(contents: WebContents, url: string): void {
    // Failures reach the window through did-fail-load, so the promise itself has nothing to add.
    contents.loadURL(url).catch(() => undefined);
  }

  // Native views draw over the whole page, so only the open tab is shown, and only while the
  // window says the browser page is showing with nothing open over it.
  function showActive(): void {
    for (const tab of tabs) tab.view?.setVisible(visible && tab.id === activeId);
  }

  function addTab(url: string, index = tabs.length): Tab {
    if (tabs.length >= MAX_BROWSER_TABS) {
      throw new Error(`Up to ${MAX_BROWSER_TABS} pages can be open. Close one to open another.`);
    }
    const tab: Tab = { id: randomUUID(), view: null, url, error: null };
    tabs.splice(index, 0, tab);
    return tab;
  }

  function activate(tab: Tab): void {
    activeId = tab.id;
    // A restored tab loads its page the first time it is shown.
    if (!tab.view && tab.url) load(viewFor(tab), tab.url);
    showActive();
    publish();
  }

  // Every tab's view is made here, so every tab gets the same settings and the same guards.
  function viewFor(tab: Tab): WebContents {
    if (tab.view) return tab.view.webContents;
    const window = owner;
    if (!window || window.isDestroyed()) throw new Error("The browser needs Zenith's window.");
    const created = new WebContentsView({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        experimentalFeatures: false,
        navigateOnDragDrop: false,
        nodeIntegration: false,
        partition: PARTITION,
        plugins: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    });
    const contents = created.webContents;

    // Links that open a new window open in a new tab beside this one; anything but http and https
    // is dropped. Only the open tab may do it, and the new tab takes its place, so a page opening
    // windows in a loop gets one tab until the person comes back to it; the cap stops the rest.
    contents.setWindowOpenHandler(({ url }) => {
      if (
        isAllowedPageUrl(url) &&
        url !== "about:blank" &&
        tab.id === activeId &&
        tabs.length < MAX_BROWSER_TABS
      ) {
        activate(addTab(url, tabs.indexOf(tab) + 1));
      }
      return { action: "deny" };
    });
    contents.on("will-navigate", (event) => {
      if (!isAllowedPageUrl(event.url)) event.preventDefault();
    });
    contents.on("will-redirect", (event) => {
      if (event.isMainFrame && !isAllowedPageUrl(event.url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    // Keys pressed in a page go to the page, not the window, so the tab keys are taken here and
    // handed to the window, which acts on them as if pressed there. This also keeps the menu from
    // closing the window on Cmd+W.
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const shortcut = browserShortcut(input, process.platform === "darwin");
      if (shortcut === null) return;
      event.preventDefault();
      if (window.isDestroyed()) return;
      window.webContents.focus();
      window.webContents.send("browser:shortcut", shortcut);
    });
    contents.on("did-start-loading", () => {
      tab.error = null;
      publish();
    });
    contents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== ERR_ABORTED) tab.error = description;
    });
    contents.on("did-stop-loading", publish);
    contents.on("did-navigate", publish);
    contents.on("did-navigate-in-page", publish);
    contents.on("page-title-updated", publish);

    created.setBounds(bounds);
    created.setVisible(visible && tab.id === activeId);
    window.contentView.addChildView(created);
    tab.view = created;
    return contents;
  }

  return {
    // The window asks for its tabs each time it shows the browser page. After a restart main has
    // none, so the saved ones come back, with only the open one loading.
    restore(window: BrowserWindow, saved: unknown): void {
      if (owner !== window) {
        destroy();
        owner = window;
        window.once("closed", () => {
          if (owner === window) destroy();
        });
      }
      if (tabs.length > 0) {
        publish();
        return;
      }
      const { urls, active } = restorableTabs(saved);
      for (const url of urls) addTab(url);
      const open = tabs[active] ?? tabs[0];
      if (open) activate(open);
    },
    newTab(): void {
      activate(addTab(""));
    },
    // The tab to its right takes over, or the one to its left when it was last, as the session
    // tabs do (closeTab in tabList.ts). Closing the last tab leaves a blank one.
    closeTab(tabId: unknown): void {
      const tab = find(tabId);
      if (!tab) return;
      const index = tabs.indexOf(tab);
      closeView(tab);
      tabs = tabs.filter((other) => other !== tab);
      if (tabs.length === 0) addTab("");
      const next = tabs[Math.min(index, tabs.length - 1)];
      if (tab.id === activeId && next) activate(next);
      else publish();
    },
    activate(tabId: unknown): void {
      const tab = find(tabId);
      if (tab) activate(tab);
    },
    navigate(tabId: unknown, urlOrQuery: unknown): void {
      if (typeof urlOrQuery !== "string") throw new TypeError("The address must be text.");
      const tab = find(tabId);
      if (!tab) throw new Error("That tab is closed.");
      const url = addressToUrl(urlOrQuery);
      tab.url = url;
      load(viewFor(tab), url);
    },
    back(tabId: unknown): void {
      contentsOf(find(tabId))?.navigationHistory.goBack();
    },
    forward(tabId: unknown): void {
      contentsOf(find(tabId))?.navigationHistory.goForward();
    },
    reload(tabId: unknown): void {
      contentsOf(find(tabId))?.reload();
    },
    stop(tabId: unknown): void {
      contentsOf(find(tabId))?.stop();
    },
    setBounds(next: unknown): void {
      const rect = (next ?? {}) as Record<keyof Bounds, unknown>;
      bounds = {
        x: coordinate(rect.x),
        y: coordinate(rect.y),
        width: coordinate(rect.width),
        height: coordinate(rect.height),
      };
      for (const tab of tabs) tab.view?.setBounds(bounds);
    },
    // The window hides the pages whenever the browser is not the open page or something (a
    // dialog, a menu) is open over it.
    setVisible(next: unknown): void {
      visible = next === true;
      showActive();
      // A window returning to the browser page learns what it is showing.
      if (visible) publish();
    },
    async openExternal(tabId: unknown): Promise<void> {
      const url = contentsOf(find(tabId))?.getURL() ?? "";
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
      await shell.openExternal(url);
    },
    destroy,
  };
}
