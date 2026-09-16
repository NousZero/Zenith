# Electron E2E Testing

Zenith's M0 E2E test uses Playwright's Electron driver and the project's installed Electron binary. It does not download or launch a separate Playwright Chromium, Firefox, or WebKit browser.

## Command

```text
npm run test:e2e
```

The command is intentionally serial with zero retries. Each invocation:

1. creates a new validated `zenith-e2e-*` directory under the operating-system temporary directory;
2. loads the exact pinned Forge Vite configuration generators and Zenith's user configs;
3. builds isolated main, preload, and production renderer output;
4. launches `node_modules\electron\dist\electron.exe` against that isolated main entry;
5. verifies title, visible landmarks, runtime version API, frozen preload surface, and absence of renderer Node/require globals;
6. records unexpected main/renderer console errors and page errors;
7. writes the current shell image to `tasks\evidence\artifacts\zenith-shell.png`;
8. closes Electron and removes only the validated temporary runtime.

## Native-dialog limitation

Playwright does not intercept Electron's operating-system-native `dialog` APIs. M0 deliberately contains no native file picker, permission prompt, credential dialog, or other native dialog, so this limitation does not reduce M0 coverage. Later milestones must use a separately tested application abstraction or a platform-specific harness before adding a native-dialog-dependent critical path.

Primary reference: https://playwright.dev/docs/api/class-electron
