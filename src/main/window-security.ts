import type { BrowserWindowConstructorOptions } from "electron";

interface PreventableEvent {
  preventDefault(): void;
}

interface GuardedSession {
  on(event: "will-download", handler: (event: PreventableEvent) => void): unknown;
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: unknown,
    ) => boolean,
  ): void;
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
      details: unknown,
    ) => void,
  ): void;
}

interface GuardedWebContents {
  on(event: "will-attach-webview", handler: (event: PreventableEvent) => void): unknown;
  on(
    event: "will-navigate",
    handler: (event: PreventableEvent, navigationUrl: string) => void,
  ): unknown;
  readonly session: GuardedSession;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
}

export function createMainWindowOptions(
  preload: string,
  platform: NodeJS.Platform = process.platform,
): BrowserWindowConstructorOptions {
  return {
    autoHideMenuBar: true,
    backgroundColor: "#0f1115",
    // On macOS the window is a native one: the traffic lights sit in Zenith's own top bar, and the
    // sidebar shows the system's translucent sidebar material. The workspace itself stays opaque.
    ...(platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
          vibrancy: "sidebar" as const,
          visualEffectState: "followWindow" as const,
          backgroundColor: "#00000000",
        }
      : {}),
    height: 800,
    minHeight: 600,
    minWidth: 960,
    show: false,
    useContentSize: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      plugins: false,
      preload,
      safeDialogs: true,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    },
    width: 1280,
  };
}

function isAllowedNavigation(navigationUrl: string, allowedTarget: URL): boolean {
  let candidate: URL;

  try {
    candidate = new URL(navigationUrl);
  } catch {
    return false;
  }

  if (allowedTarget.protocol === "file:") {
    return candidate.protocol === "file:" && candidate.pathname === allowedTarget.pathname;
  }

  if (allowedTarget.origin !== "null") {
    return candidate.origin === allowedTarget.origin;
  }

  return candidate.protocol === allowedTarget.protocol && candidate.host === allowedTarget.host;
}

export function installWebContentsGuards(
  webContents: GuardedWebContents,
  allowedTarget: URL,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl, allowedTarget)) event.preventDefault();
  });

  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  webContents.session.on("will-download", (event) => {
    event.preventDefault();
  });
  webContents.session.setPermissionCheckHandler(() => false);
  webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}
