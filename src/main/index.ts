import { app, BrowserWindow, protocol } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { registerIpcHandlers } from "./ipc";
import { PREVIEW_SCHEME_PRIVILEGES, registerPreviewProtocol } from "./preview-protocol";
import { createMainWindowOptions, installWebContentsGuards } from "./window-security";

protocol.registerSchemesAsPrivileged([PREVIEW_SCHEME_PRIVILEGES]);

let mainWindow: BrowserWindow | null = null;

function getRendererTarget(): URL {
  const developmentUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string"
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : undefined;
  if (developmentUrl) return new URL(developmentUrl);
  const rendererName =
    typeof MAIN_WINDOW_VITE_NAME === "string" ? MAIN_WINDOW_VITE_NAME : "main_window";
  return pathToFileURL(join(__dirname, "..", "renderer", rendererName, "index.html"));
}

async function createMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) return;
  const target = getRendererTarget();
  const window = new BrowserWindow(createMainWindowOptions(join(__dirname, "preload.js")));
  mainWindow = window;
  installWebContentsGuards(window.webContents, target);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  await window.loadURL(target.href);
}

void app.whenReady().then(() => {
  const ipc = registerIpcHandlers({ userDataPath: app.getPath("userData"), join });
  registerPreviewProtocol(protocol, ipc.isOpenProject);
  app.on("will-quit", () => ipc.dispose());
  void createMainWindow();
  app.on("activate", () => void createMainWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
