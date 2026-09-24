import { session, shell, WebContentsView, type BrowserWindow, type WebContents } from "electron";

import { addressToUrl, isAllowedPageUrl } from "../shared/browser-address";
import type { BrowserViewState } from "../shared/types";

// The built-in browser the person uses, as opposed to the pages agents drive in `browser.ts`.
//
// It is one native view drawn over the main window, since `<webview>` stays disabled. What it
// shows is the open web, so it is treated like `browser.ts` treats its pages: its own session, so
// sites never see Zenith's cookies or storage; no preload and no Node; only http and https; no
// camera, microphone, location or other permissions; and no file saved without a save dialog.

const PARTITION = "persist:zenith-browser";
// Chromium reports a navigation replaced by a newer one as aborted; that is not a failure.
const ERR_ABORTED = -3;

type Bounds = { x: number; y: number; width: number; height: number };

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

  let view: WebContentsView | null = null;
  let owner: BrowserWindow | null = null;
  let bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  let visible = false;
  let error: string | null = null;

  function state(contents: WebContents): BrowserViewState {
    return {
      url: contents.getURL(),
      title: contents.getTitle(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      loading: contents.isLoading(),
      error,
    };
  }

  function publish(): void {
    if (!view || !owner || owner.isDestroyed()) return;
    owner.webContents.send("browser:state", state(view.webContents));
  }

  function destroy(): void {
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = null;
    owner = null;
  }

  function load(contents: WebContents, url: string): void {
    // Failures reach the window through did-fail-load, so the promise itself has nothing to add.
    contents.loadURL(url).catch(() => undefined);
  }

  // The view is made on the first navigation, so an unused browser costs nothing.
  function viewFor(window: BrowserWindow): WebContentsView {
    if (view && owner === window) return view;
    destroy();
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

    // Links that open a new window open here instead; anything but http and https is dropped.
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedPageUrl(url) && url !== "about:blank") load(contents, url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event) => {
      if (!isAllowedPageUrl(event.url)) event.preventDefault();
    });
    contents.on("will-redirect", (event) => {
      if (event.isMainFrame && !isAllowedPageUrl(event.url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("did-start-loading", () => {
      error = null;
      publish();
    });
    contents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== ERR_ABORTED) error = description;
    });
    contents.on("did-stop-loading", publish);
    contents.on("did-navigate", publish);
    contents.on("did-navigate-in-page", publish);
    contents.on("page-title-updated", publish);

    created.setBounds(bounds);
    created.setVisible(visible);
    window.contentView.addChildView(created);
    window.once("closed", () => {
      if (owner === window) destroy();
    });
    view = created;
    owner = window;
    return created;
  }

  function current(): WebContents | null {
    return view && !view.webContents.isDestroyed() ? view.webContents : null;
  }

  return {
    navigate(window: BrowserWindow, urlOrQuery: unknown): void {
      if (typeof urlOrQuery !== "string") throw new TypeError("The address must be text.");
      const url = addressToUrl(urlOrQuery);
      load(viewFor(window).webContents, url);
    },
    back(): void {
      current()?.navigationHistory.goBack();
    },
    forward(): void {
      current()?.navigationHistory.goForward();
    },
    reload(): void {
      current()?.reload();
    },
    stop(): void {
      current()?.stop();
    },
    setBounds(next: unknown): void {
      const rect = (next ?? {}) as Record<keyof Bounds, unknown>;
      bounds = {
        x: coordinate(rect.x),
        y: coordinate(rect.y),
        width: coordinate(rect.width),
        height: coordinate(rect.height),
      };
      view?.setBounds(bounds);
    },
    // Native views draw over the whole page, so the window hides this one whenever the browser is
    // not the open page or something (a dialog, a menu) is open over it.
    setVisible(next: unknown): void {
      visible = next === true;
      view?.setVisible(visible);
      // A window returning to the browser page learns what it is showing.
      if (visible) publish();
    },
    async openExternal(): Promise<void> {
      const url = current()?.getURL() ?? "";
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
      await shell.openExternal(url);
    },
    destroy,
  };
}
