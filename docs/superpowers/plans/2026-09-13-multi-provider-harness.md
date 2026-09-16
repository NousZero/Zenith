# Multi-Provider AI Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Zenith from a Windows-only, ADR-gated development workbench into a cross-platform (Windows/macOS/Linux) Electron app that lets a user fan one prompt out to several AI provider panes at once, then continue each pane's conversation independently.

**Architecture:** Main process holds provider adapters (OpenAI, Anthropic, OpenRouter, one shared interface), a `safeStorage`-backed credential store, and a plain-JSON session store. Renderer is a single-window React UI: pane list, shared prompt bar, per-session memory panel, sessions sidebar. IPC is plain `ipcMain.handle`/`ipcRenderer.invoke` plus one streamed-chunk event — no custom envelope/router layer.

**Tech Stack:** Electron 43, Vite (electron-forge plugin-vite), React 19, TypeScript, Vitest. Native `fetch`/`ReadableStream` for provider HTTP calls — no HTTP client dependency.

**Spec:** `docs/superpowers/specs/2026-09-13-multi-provider-harness-design.md`

## Global Constraints

- No ADR documents, no numbered gates/checkpoints for this work (spec §9).
- Tests are required for real logic: provider adapters, credential store, session store, fan-out/memory-injection (spec §9). UI wiring code may ship without a test first; add tests opportunistically.
- No dynamic/pluggable provider loading — adapters are compiled-in files (spec §4, §10).
- No shared wire-normalization layer across providers beyond raw SSE line-splitting (spec §4).
- No cost estimation, only token counts (spec §5, §10).
- No RAG/embeddings/search — the memory panel is manual text only (spec §7, §10).
- Cross-platform packaging: win32, darwin, linux all ship from one `forge.config.ts` (spec §8).
- `docs/decisions/*`, `PLAN.md`, `tasks/plan.md`, `tasks/todo.md` are left in place as historical record, not deleted, not updated to match new work (spec §2, §9).

---

### Task 1: Reset the repository to a minimal cross-platform Electron shell

**Files:**
- Delete: `src/main/**` (all files), `src/preload/**` (all files) except none kept as-is, `src/renderer/**` (all files), `src/shared/**` (all files)
- Delete: `tests/component/**`, `tests/e2e/**`, `tests/fixtures/**`, `tests/helpers/**`, `tests/integration/**`, `tests/security/**`, `tests/unit/**` (keep `tests/setup.ts`)
- Delete: `utility/fixed-test-verifier.cjs`, `resources/supplied/**`
- Delete: `scripts/diagnostics-safe-storage.mjs`, `scripts/diagnostics.mjs`, `scripts/verify-lifecycle-denial.mjs`, `scripts/verify-package.mjs`
- Delete: `playwright.config.ts`
- Modify: `package.json`, `forge.config.ts`, `vitest.config.ts`, `scripts/check-dependency-specs.mjs`, `.github/workflows/ci.yml`
- Create: `src/shared/.gitkeep` is not needed — Task 2 creates real files immediately after this task in the same work session

**Interfaces:**
- Produces: an app that runs (`npm run dev`) showing a blank white Electron window (default Vite React template content is fine as a placeholder screen — Task 12 replaces it), and `npm run typecheck` / `npm run lint` / `npm run format:check` pass against the emptied `src/` tree.

- [ ] **Step 1: Delete the workbench-specific source, tests, and support files**

```bash
git rm -r src/main src/preload src/renderer src/shared
git rm -r tests/component tests/e2e tests/fixtures tests/helpers tests/integration tests/security tests/unit
git rm utility/fixed-test-verifier.cjs
git rm -r resources/supplied
git rm scripts/diagnostics-safe-storage.mjs scripts/diagnostics.mjs scripts/verify-lifecycle-denial.mjs scripts/verify-package.mjs
git rm playwright.config.ts
mkdir -p src/main src/preload src/renderer src/shared tests/unit tests/integration tests/component
```

- [ ] **Step 2: Recreate the minimal main/preload/renderer entry points**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createMainWindowOptions, installWebContentsGuards } from "./window-security";

let mainWindow: BrowserWindow | null = null;

function getRendererTarget(): URL {
  const developmentUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string" ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
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
  void createMainWindow();
  app.on("activate", () => void createMainWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

`src/main/window-security.ts` — copy verbatim from the current file at this path before deletion (it is generic Electron hardening, not workbench- or Windows-specific: `contextIsolation`, `sandbox`, denied window-open/navigation/webview/download, denied permission checks). Re-create it with the exact same content it has today.

`src/preload/index.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("zenith", {});
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zenith</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/renderer/App.tsx`:

```tsx
export function App() {
  return <div style={{ padding: 16, fontFamily: "sans-serif" }}>Zenith</div>;
}
```

`src/renderer/environment.d.ts`:

```ts
export {};

declare global {
  interface Window {
    zenith: Record<string, never>;
  }
}
```

- [ ] **Step 3: Trim `package.json` to the scripts and description this reset needs**

Edit `package.json`:
- Change `"description"` to `"Cross-platform desktop harness for working with multiple AI providers in one session"`.
- Replace the `"scripts"` block with:

```json
"scripts": {
  "preflight:deps": "node scripts/check-dependency-specs.mjs",
  "dev": "electron-forge start",
  "format:check": "prettier --check --no-error-on-unmatched-pattern package.json scripts/**/*.mjs *.{mjs,ts} src/**/*.{ts,tsx,css,html} tests/**/*.{ts,tsx}",
  "lint": "eslint . --max-warnings 0 --flag unstable_native_nodejs_ts_config",
  "typecheck": "tsc --noEmit --project tsconfig.json --pretty false && tsc --build tsconfig.processes.json --pretty false",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:component": "vitest run --project component",
  "test": "npm run test:unit && npm run test:integration && npm run test:component",
  "verify": "npm run preflight:deps && npm run format:check && npm run lint && npm run typecheck && npm run test",
  "package": "node scripts/forge-build.mjs package",
  "make": "node scripts/forge-build.mjs make"
}
```

- [ ] **Step 4: Update the dependency-spec checker's required-scripts list**

In `scripts/check-dependency-specs.mjs`, replace the `requiredScripts` array with:

```js
const requiredScripts = [
  "dev",
  "format:check",
  "lint",
  "typecheck",
  "test:unit",
  "test:integration",
  "test:component",
  "test",
  "verify",
  "package",
  "make",
];
```

- [ ] **Step 5: Drop the unused `security` test project from `vitest.config.ts`**

Remove the `nodeProject("security", ["tests/security/**/*.test.{ts,tsx}"])` line and its trailing comma from the `projects` array in `vitest.config.ts`.

- [ ] **Step 6: Update `forge.config.ts` to drop the workbench snapshot-packaging hook**

Remove the `suppliedSnapshotSegments` constant and the `sourceSnapshotRoot`/`packagedSnapshotRoot`/`materializeSuppliedSnapshot`/`verifyMaterializedSuppliedSnapshot` block from the `packageAfterPrune` hook, and remove the now-unused `materializeSuppliedSnapshot`/`verifyMaterializedSuppliedSnapshot` import. Keep the `fixedVerifierName`/`utility` copy step removed too (that file was deleted in Step 1) — the hook should end up only rewriting the packaged manifest's `type`/`main` fields. (Task 14 replaces `makers` for cross-platform output; leave `makers` untouched here.)

- [ ] **Step 7: Point CI at a Linux runner instead of Windows**

In `.github/workflows/ci.yml`, change `"name": "Windows source verification"` to `"name": "Ubuntu source verification"` and `"runs-on": "windows-latest"` to `"runs-on": "ubuntu-latest"`.

- [ ] **Step 8: Verify the reset app boots and the toolchain passes**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with zero errors against the trimmed tree.

Run: `npm run dev`
Expected: an Electron window opens showing "Zenith" in the top-left corner. Close it.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "reset: strip workbench subsystems for the multi-provider harness rebuild"
```

---

### Task 2: Shared types and the provider adapter registry

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/providers/registry.ts`
- Test: `tests/unit/providers/registry.test.ts`

**Interfaces:**
- Produces: `ChatMessage`, `ChatChunk`, `Model`, `ProviderAdapter`, `PaneState`, `SessionState` types (consumed by every later task); `createProviderRegistry(adapters: ProviderAdapter[])` returning `{ get(id: string): ProviderAdapter; list(): string[] }`.

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
}

export interface Model {
  id: string;
  label: string;
}

export interface SendMessageRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  id: string;
  listModels(): Promise<Model[]>;
  sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk>;
  validateCredential(cred: string): Promise<boolean>;
}

export interface PaneState {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  included: boolean;
  memoryEnabled: boolean;
  messages: ChatMessage[];
  promptTokens: number;
  completionTokens: number;
}

export interface SessionState {
  id: string;
  name: string;
  memoryText: string;
  panes: PaneState[];
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing registry test**

`tests/unit/providers/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createProviderRegistry } from "../../../src/main/providers/registry";
import type { ProviderAdapter } from "../../../src/shared/types";

function fakeAdapter(id: string): ProviderAdapter {
  return {
    id,
    async listModels() {
      return [{ id: "fake-model", label: "Fake Model" }];
    },
    async validateCredential() {
      return true;
    },
    async *sendMessage() {
      yield { delta: "", done: true };
    },
  };
}

describe("createProviderRegistry", () => {
  it("looks up a registered adapter by id", () => {
    const registry = createProviderRegistry([fakeAdapter("openai"), fakeAdapter("anthropic")]);
    expect(registry.get("openai").id).toBe("openai");
    expect(registry.list().sort()).toEqual(["anthropic", "openai"]);
  });

  it("throws for an unknown provider id", () => {
    const registry = createProviderRegistry([fakeAdapter("openai")]);
    expect(() => registry.get("does-not-exist")).toThrow("Unknown provider: does-not-exist");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/providers/registry.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/providers/registry'"

- [ ] **Step 4: Write `src/main/providers/registry.ts`**

```ts
import type { ProviderAdapter } from "../../shared/types";

export interface ProviderRegistry {
  get(id: string): ProviderAdapter;
  list(): string[];
}

export function createProviderRegistry(adapters: ProviderAdapter[]): ProviderRegistry {
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  return {
    get(id: string): ProviderAdapter {
      const adapter = byId.get(id);
      if (!adapter) throw new Error(`Unknown provider: ${id}`);
      return adapter;
    },
    list(): string[] {
      return [...byId.keys()];
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/providers/registry.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/providers/registry.ts tests/unit/providers/registry.test.ts
git commit -m "feat: add shared chat types and provider adapter registry"
```

---

### Task 3: Shared SSE line reader for streaming provider responses

**Files:**
- Create: `src/main/providers/sse.ts`
- Test: `tests/unit/providers/sse.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `readSseLines(response: Response, signal?: AbortSignal): AsyncIterable<string>` — yields the text after `data:` on each SSE line, used by Tasks 4-6.

- [ ] **Step 1: Write the failing test**

`tests/unit/providers/sse.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { readSseLines } from "../../../src/main/providers/sse";

function responseFromChunks(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

describe("readSseLines", () => {
  it("yields the payload after data: for each event line", async () => {
    const response = responseFromChunks([
      "data: {\"a\":1}\n",
      "event: message\ndata: {\"a\":2}\n\n",
    ]);
    const lines: string[] = [];
    for await (const line of readSseLines(response)) lines.push(line);
    expect(lines).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("splits a data: line arriving across two chunks", async () => {
    const response = responseFromChunks(["data: {\"a\"", ":3}\n"]);
    const lines: string[] = [];
    for await (const line of readSseLines(response)) lines.push(line);
    expect(lines).toEqual(['{"a":3}']);
  });

  it("stops early when the signal is already aborted", async () => {
    const response = responseFromChunks(["data: {\"a\":1}\n"]);
    const controller = new AbortController();
    controller.abort();
    const lines: string[] = [];
    for await (const line of readSseLines(response, controller.signal)) lines.push(line);
    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/providers/sse.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/providers/sse'"

- [ ] **Step 3: Write `src/main/providers/sse.ts`**

```ts
export async function* readSseLines(
  response: Response,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response had no readable body.");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/providers/sse.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/sse.ts tests/unit/providers/sse.test.ts
git commit -m "feat: add shared SSE line reader for provider streaming"
```

---

### Task 4: OpenAI adapter

**Files:**
- Create: `src/main/providers/openai.ts`
- Test: `tests/unit/providers/openai.test.ts`

**Interfaces:**
- Consumes: `readSseLines` (Task 3), `ProviderAdapter`/`ChatChunk`/`Model`/`SendMessageRequest` (Task 2).
- Produces: `createOpenAiAdapter(getApiKey: () => Promise<string>): ProviderAdapter` with `id: "openai"`.

- [ ] **Step 1: Write the failing test**

`tests/unit/providers/openai.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenAiAdapter } from "../../../src/main/providers/openai";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createOpenAiAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams concatenated text deltas and a final done chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createOpenAiAdapter(async () => "sk-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Hel", done: false },
      { delta: "lo", done: false },
      { delta: "", done: true },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      }),
    );
  });

  it("throws with the response body when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })),
    );
    const adapter = createOpenAiAdapter(async () => "sk-bad");
    const iterator = adapter.sendMessage({ model: "gpt-4o-mini", messages: [] })[
      Symbol.asyncIterator
    ]();
    await expect(iterator.next()).rejects.toThrow("OpenAI request failed: 401");
  });

  it("reports credential validity from the models endpoint status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const adapter = createOpenAiAdapter(async () => "sk-test");
    await expect(adapter.validateCredential("sk-test")).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/providers/openai.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/providers/openai'"

- [ ] **Step 3: Write `src/main/providers/openai.ts`**

```ts
import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { readSseLines } from "./sse";

const API_BASE = "https://api.openai.com/v1";

export function createOpenAiAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "openai",

    async listModels(): Promise<Model[]> {
      const apiKey = await getApiKey();
      const response = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`OpenAI model list failed: ${response.status}`);
      const body = (await response.json()) as { data: { id: string }[] };
      return body.data
        .filter((model) => model.id.startsWith("gpt-") || model.id.startsWith("o"))
        .map((model) => ({ id: model.id, label: model.id }));
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${cred}` },
      });
      return response.ok;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          stream: true,
          messages: req.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: req.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenAI request failed: ${response.status} ${text}`);
      }
      for await (const payload of readSseLines(response, req.signal)) {
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        const parsed = JSON.parse(payload) as { choices: { delta: { content?: string } }[] };
        const delta = parsed.choices[0]?.delta.content ?? "";
        if (delta) yield { delta, done: false };
      }
      yield { delta: "", done: true };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/providers/openai.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/openai.ts tests/unit/providers/openai.test.ts
git commit -m "feat: add streaming OpenAI provider adapter"
```

---

### Task 5: Anthropic adapter

**Files:**
- Create: `src/main/providers/anthropic.ts`
- Test: `tests/unit/providers/anthropic.test.ts`

**Interfaces:**
- Consumes: `readSseLines` (Task 3), shared types (Task 2).
- Produces: `createAnthropicAdapter(getApiKey: () => Promise<string>): ProviderAdapter` with `id: "anthropic"`.

Anthropic's Messages API takes `system` as a separate top-level field rather than a `system`-role message, and streams `content_block_delta` / `message_stop` events. This adapter pulls any leading `system`-role messages out of the message list into that field.

- [ ] **Step 1: Write the failing test**

`tests/unit/providers/anthropic.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicAdapter } from "../../../src/main/providers/anthropic";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createAnthropicAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams content_block_delta text and stops at message_stop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: "content_block_delta", delta: { text: "Hel" } }),
        JSON.stringify({ type: "content_block_delta", delta: { text: "lo" } }),
        JSON.stringify({ type: "message_stop" }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter(async () => "sk-ant-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "claude-sonnet-5",
      messages: [
        { role: "system", content: "Be terse." },
        { role: "user", content: "hi" },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Hel", done: false },
      { delta: "lo", done: false },
      { delta: "", done: true },
    ]);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { system?: string; messages: unknown[] };
    expect(body.system).toBe("Be terse.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(options.headers).toMatchObject({ "x-api-key": "sk-ant-test" });
  });

  it("throws with the response body when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })),
    );
    const adapter = createAnthropicAdapter(async () => "sk-ant-bad");
    const iterator = adapter.sendMessage({ model: "claude-sonnet-5", messages: [] })[
      Symbol.asyncIterator
    ]();
    await expect(iterator.next()).rejects.toThrow("Anthropic request failed: 401");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/providers/anthropic.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/providers/anthropic'"

- [ ] **Step 3: Write `src/main/providers/anthropic.ts`**

```ts
import type { ChatChunk, ChatMessage, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { readSseLines } from "./sse";

const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function splitSystemPrompt(messages: ChatMessage[]): {
  system: string | undefined;
  rest: { role: "user" | "assistant"; content: string }[];
} {
  const systemLines = messages.filter((message) => message.role === "system").map((m) => m.content);
  const rest = messages
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }));
  return { system: systemLines.length > 0 ? systemLines.join("\n") : undefined, rest };
}

export function createAnthropicAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "anthropic",

    async listModels(): Promise<Model[]> {
      return [
        { id: "claude-opus-5", label: "Claude Opus 5" },
        { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
        { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      ];
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": cred,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [] }),
      });
      return response.status !== 401 && response.status !== 403;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const { system, rest } = splitSystemPrompt(req.messages);
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: 4096,
          stream: true,
          ...(system ? { system } : {}),
          messages: rest,
        }),
        signal: req.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Anthropic request failed: ${response.status} ${text}`);
      }
      for await (const payload of readSseLines(response, req.signal)) {
        const parsed = JSON.parse(payload) as {
          type: string;
          delta?: { text?: string };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield { delta: parsed.delta.text, done: false };
        } else if (parsed.type === "message_stop") {
          yield { delta: "", done: true };
          return;
        }
      }
      yield { delta: "", done: true };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/providers/anthropic.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/anthropic.ts tests/unit/providers/anthropic.test.ts
git commit -m "feat: add streaming Anthropic provider adapter"
```

---

### Task 6: OpenRouter adapter

**Files:**
- Create: `src/main/providers/openrouter.ts`
- Test: `tests/unit/providers/openrouter.test.ts`

**Interfaces:**
- Consumes: `readSseLines` (Task 3), shared types (Task 2).
- Produces: `createOpenRouterAdapter(getApiKey: () => Promise<string>): ProviderAdapter` with `id: "openrouter"`. OpenRouter's chat-completions wire format is OpenAI-compatible, so the streaming/parsing shape mirrors Task 4 with a different base URL and model-list shape.

- [ ] **Step 1: Write the failing test**

`tests/unit/providers/openrouter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenRouterAdapter } from "../../../src/main/providers/openrouter";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createOpenRouterAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams concatenated text deltas and a final done chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createOpenRouterAdapter(async () => "or-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "meta-llama/llama-3.1-70b-instruct",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Hel", done: false },
      { delta: "lo", done: false },
      { delta: "", done: true },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer or-test" }),
      }),
    );
  });

  it("lists models from the OpenRouter catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "openai/gpt-4o", name: "OpenAI: GPT-4o" }] }),
          { status: 200 },
        ),
      ),
    );
    const adapter = createOpenRouterAdapter(async () => "or-test");
    await expect(adapter.listModels()).resolves.toEqual([
      { id: "openai/gpt-4o", label: "OpenAI: GPT-4o" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/providers/openrouter.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/providers/openrouter'"

- [ ] **Step 3: Write `src/main/providers/openrouter.ts`**

```ts
import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { readSseLines } from "./sse";

const API_BASE = "https://openrouter.ai/api/v1";

export function createOpenRouterAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "openrouter",

    async listModels(): Promise<Model[]> {
      const response = await fetch(`${API_BASE}/models`);
      if (!response.ok) throw new Error(`OpenRouter model list failed: ${response.status}`);
      const body = (await response.json()) as { data: { id: string; name: string }[] };
      return body.data.map((model) => ({ id: model.id, label: model.name }));
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await fetch(`${API_BASE}/auth/key`, {
        headers: { Authorization: `Bearer ${cred}` },
      });
      return response.ok;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          stream: true,
          messages: req.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: req.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
      }
      for await (const payload of readSseLines(response, req.signal)) {
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        const parsed = JSON.parse(payload) as { choices: { delta: { content?: string } }[] };
        const delta = parsed.choices[0]?.delta.content ?? "";
        if (delta) yield { delta, done: false };
      }
      yield { delta: "", done: true };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/providers/openrouter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/openrouter.ts tests/unit/providers/openrouter.test.ts
git commit -m "feat: add streaming OpenRouter provider adapter"
```

---

### Task 7: Cross-platform credential store

**Files:**
- Create: `src/main/credential-store.ts`
- Test: `tests/integration/credential-store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone).
- Produces: `createCredentialStore(options: { safeStorage: SafeStoragePort; filePath: string }): CredentialStore` with `get(providerId)`, `set(providerId, secret)`, `delete(providerId)`, `list()`. `SafeStoragePort` is the minimal slice of Electron's `safeStorage` this store needs, so tests can pass a fake. Task 9 wires the real Electron `safeStorage` module and a `filePath` under `app.getPath("userData")`.

This replaces the old `src/main/credential-store.ts` (deleted in Task 1): the old file hardcoded `node:path`'s `win32` variant for path checks, making it Windows-only. This version uses the platform-native `node:path` and stores one JSON file of base64 ciphertexts, keyed by provider id — no journal, no canonicalization, no digest chain.

- [ ] **Step 1: Write the failing test**

`tests/integration/credential-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCredentialStore } from "../../src/main/credential-store";

function fakeSafeStorage() {
  let available = true;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, "utf8"),
    decryptString: (encrypted: Buffer) => encrypted.toString("utf8").replace(/^enc:/, ""),
    setAvailable(value: boolean) {
      available = value;
    },
  };
}

describe("createCredentialStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-credentials-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a secret through set/get", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await store.set("openai", "sk-secret");
    await expect(store.get("openai")).resolves.toBe("sk-secret");
    await expect(store.list()).resolves.toEqual(["openai"]);
  });

  it("returns undefined for a provider with no stored credential", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await expect(store.get("anthropic")).resolves.toBeUndefined();
  });

  it("removes a credential on delete", async () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage(),
      filePath: join(dir, "credentials.json"),
    });
    await store.set("openai", "sk-secret");
    await store.delete("openai");
    await expect(store.get("openai")).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });

  it("throws when OS encryption is unavailable", async () => {
    const safeStorage = fakeSafeStorage();
    safeStorage.setAvailable(false);
    const store = createCredentialStore({ safeStorage, filePath: join(dir, "credentials.json") });
    await expect(store.set("openai", "sk-secret")).rejects.toThrow(
      "OS credential encryption is unavailable.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project integration tests/integration/credential-store.test.ts`
Expected: FAIL with "Cannot find module '../../src/main/credential-store'"

- [ ] **Step 3: Write `src/main/credential-store.ts`**

```ts
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CredentialStore {
  get(providerId: string): Promise<string | undefined>;
  set(providerId: string, secret: string): Promise<void>;
  delete(providerId: string): Promise<void>;
  list(): Promise<string[]>;
}

export function createCredentialStore(options: {
  safeStorage: SafeStoragePort;
  filePath: string;
}): CredentialStore {
  async function readAll(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(options.filePath, "utf8");
      return JSON.parse(raw) as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeAll(data: Record<string, string>): Promise<void> {
    await fs.mkdir(dirname(options.filePath), { recursive: true });
    await fs.writeFile(options.filePath, JSON.stringify(data), "utf8");
  }

  function requireEncryption(): void {
    if (!options.safeStorage.isEncryptionAvailable()) {
      throw new Error("OS credential encryption is unavailable.");
    }
  }

  return {
    async get(providerId) {
      const data = await readAll();
      const encoded = data[providerId];
      if (!encoded) return undefined;
      requireEncryption();
      return options.safeStorage.decryptString(Buffer.from(encoded, "base64"));
    },
    async set(providerId, secret) {
      requireEncryption();
      const data = await readAll();
      data[providerId] = options.safeStorage.encryptString(secret).toString("base64");
      await writeAll(data);
    },
    async delete(providerId) {
      const data = await readAll();
      delete data[providerId];
      await writeAll(data);
    },
    async list() {
      return Object.keys(await readAll());
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project integration tests/integration/credential-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/credential-store.ts tests/integration/credential-store.test.ts
git commit -m "feat: add cross-platform safeStorage-backed credential store"
```

---

### Task 8: Session store (named sessions as plain JSON)

**Files:**
- Create: `src/main/session-store.ts`
- Test: `tests/integration/session-store.test.ts`

**Interfaces:**
- Consumes: `SessionState` (Task 2).
- Produces: `createSessionStore(sessionsDir: string): SessionStore` with `list()`, `load(id)`, `save(session)`, `delete(id)`.

- [ ] **Step 1: Write the failing test**

`tests/integration/session-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSessionStore } from "../../src/main/session-store";
import type { SessionState } from "../../src/shared/types";

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "session-1",
    name: "First session",
    memoryText: "",
    panes: [],
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("createSessionStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-sessions-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a session through save/load", async () => {
    const store = createSessionStore(dir);
    const session = makeSession();
    await store.save(session);
    await expect(store.load("session-1")).resolves.toEqual(session);
  });

  it("returns undefined for a session that does not exist", async () => {
    const store = createSessionStore(dir);
    await expect(store.load("missing")).resolves.toBeUndefined();
  });

  it("lists sessions newest-first by updatedAt", async () => {
    const store = createSessionStore(dir);
    await store.save(makeSession({ id: "old", name: "Old", updatedAt: 1 }));
    await store.save(makeSession({ id: "new", name: "New", updatedAt: 2 }));
    await expect(store.list()).resolves.toEqual([
      { id: "new", name: "New", updatedAt: 2 },
      { id: "old", name: "Old", updatedAt: 1 },
    ]);
  });

  it("removes a session on delete", async () => {
    const store = createSessionStore(dir);
    await store.save(makeSession());
    await store.delete("session-1");
    await expect(store.load("session-1")).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project integration tests/integration/session-store.test.ts`
Expected: FAIL with "Cannot find module '../../src/main/session-store'"

- [ ] **Step 3: Write `src/main/session-store.ts`**

```ts
import { promises as fs } from "node:fs";
import { join } from "node:path";

import type { SessionState } from "../shared/types";

export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface SessionStore {
  list(): Promise<SessionSummary[]>;
  load(id: string): Promise<SessionState | undefined>;
  save(session: SessionState): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createSessionStore(sessionsDir: string): SessionStore {
  function filePath(id: string): string {
    return join(sessionsDir, `${id}.json`);
  }

  return {
    async list() {
      await fs.mkdir(sessionsDir, { recursive: true });
      const entries = await fs.readdir(sessionsDir);
      const summaries = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const raw = await fs.readFile(join(sessionsDir, entry), "utf8");
            const session = JSON.parse(raw) as SessionState;
            return { id: session.id, name: session.name, updatedAt: session.updatedAt };
          }),
      );
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) {
      try {
        const raw = await fs.readFile(filePath(id), "utf8");
        return JSON.parse(raw) as SessionState;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    async save(session) {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(filePath(session.id), JSON.stringify(session, null, 2), "utf8");
    },
    async delete(id) {
      await fs.rm(filePath(id), { force: true });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project integration tests/integration/session-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/session-store.ts tests/integration/session-store.test.ts
git commit -m "feat: add plain-JSON named-session store"
```

---

### Task 9: Fan-out message builder and token estimation

**Files:**
- Create: `src/shared/fan-out.ts`
- Create: `src/shared/tokens.ts`
- Test: `tests/unit/fan-out.test.ts`
- Test: `tests/unit/tokens.test.ts`

**Interfaces:**
- Consumes: `PaneState`, `ChatMessage` (Task 2).
- Produces: `buildFanOutMessages(pane: PaneState, prompt: string, memoryText: string): ChatMessage[]` (consumed by Task 10's send handler); `estimateTokens(text: string): number` (consumed by Task 10 to update `promptTokens`/`completionTokens`, and by Task 12/13 to render the stat bar).

Token counting is a character-length heuristic (`Math.ceil(length / 4)`), not a real tokenizer — accurate enough for a rough usage indicator without adding a tokenizer dependency.

```
ponytail: token count is a chars/4 heuristic, not a real tokenizer. Upgrade to
tiktoken/anthropic-tokenizer per provider if users need exact counts.
```

- [ ] **Step 1: Write the failing fan-out test**

`tests/unit/fan-out.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildFanOutMessages } from "../../src/shared/fan-out";
import type { PaneState } from "../../src/shared/types";

function makePane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: "pane-1",
    name: "Pane 1",
    providerId: "openai",
    modelId: "gpt-4o-mini",
    included: true,
    memoryEnabled: false,
    messages: [],
    promptTokens: 0,
    completionTokens: 0,
    ...overrides,
  };
}

describe("buildFanOutMessages", () => {
  it("appends the prompt after existing history when memory is off", () => {
    const pane = makePane({ messages: [{ role: "user", content: "earlier" }] });
    expect(buildFanOutMessages(pane, "new prompt", "remember this")).toEqual([
      { role: "user", content: "earlier" },
      { role: "user", content: "new prompt" },
    ]);
  });

  it("prepends memory text as a system message when the pane's toggle is on", () => {
    const pane = makePane({ memoryEnabled: true, messages: [{ role: "user", content: "earlier" }] });
    expect(buildFanOutMessages(pane, "new prompt", "remember this")).toEqual([
      { role: "system", content: "remember this" },
      { role: "user", content: "earlier" },
      { role: "user", content: "new prompt" },
    ]);
  });

  it("skips the memory message when memory text is blank even if the toggle is on", () => {
    const pane = makePane({ memoryEnabled: true });
    expect(buildFanOutMessages(pane, "new prompt", "   ")).toEqual([
      { role: "user", content: "new prompt" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/fan-out.test.ts`
Expected: FAIL with "Cannot find module '../../src/shared/fan-out'"

- [ ] **Step 3: Write `src/shared/fan-out.ts`**

```ts
import type { ChatMessage, PaneState } from "./types";

export function buildFanOutMessages(
  pane: PaneState,
  prompt: string,
  memoryText: string,
): ChatMessage[] {
  const trimmedMemory = memoryText.trim();
  const memoryMessage: ChatMessage[] =
    pane.memoryEnabled && trimmedMemory.length > 0
      ? [{ role: "system", content: trimmedMemory }]
      : [];
  return [...memoryMessage, ...pane.messages, { role: "user", content: prompt }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/fan-out.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tokens test**

`tests/unit/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { estimateTokens } from "../../src/shared/tokens";

describe("estimateTokens", () => {
  it("estimates roughly one token per four characters, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run --project unit tests/unit/tokens.test.ts`
Expected: FAIL with "Cannot find module '../../src/shared/tokens'"

- [ ] **Step 7: Write `src/shared/tokens.ts`**

```ts
// ponytail: chars/4 heuristic, not a real tokenizer. Upgrade to a
// per-provider tokenizer if users need exact counts.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run --project unit tests/unit/tokens.test.ts`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add src/shared/fan-out.ts src/shared/tokens.ts tests/unit/fan-out.test.ts tests/unit/tokens.test.ts
git commit -m "feat: add fan-out message builder and token estimation"
```

---

### Task 10: Main-process IPC wiring

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/main/ipc.ts`

**Interfaces:**
- Consumes: `createProviderRegistry` (Task 2), `createOpenAiAdapter`/`createAnthropicAdapter`/`createOpenRouterAdapter` (Tasks 4-6), `createCredentialStore` (Task 7), `createSessionStore` (Task 8), `buildFanOutMessages`/`estimateTokens` (Task 9).
- Produces: `registerIpcHandlers(options): { abortAll(): void }`, wired into `app.whenReady()` in `src/main/index.ts`. IPC channel contract consumed by the preload bridge in Task 11:
  - `providers:listModels` invoke `(providerId: string) => Model[]`
  - `credentials:list` invoke `() => string[]`
  - `credentials:set` invoke `({ providerId: string; secret: string }) => void`
  - `credentials:delete` invoke `(providerId: string) => void`
  - `sessions:list` invoke `() => SessionSummary[]`
  - `sessions:load` invoke `(id: string) => SessionState | undefined`
  - `sessions:save` invoke `(session: SessionState) => void`
  - `sessions:delete` invoke `(id: string) => void`
  - `chat:send` invoke `({ requestId: string; paneId: string; providerId: string; modelId: string; messages: ChatMessage[] }) => void` — resolves once the stream ends; chunks arrive as `chat:chunk` events on the same `webContents` while it runs.
  - `chat:abort` invoke `(requestId: string) => void`
  - event `chat:chunk` sent to renderer: `{ requestId: string; paneId: string; chunk: ChatChunk }`

This is main-process glue with no independent unit surface; it is verified end-to-end manually in Task 12's Step (the renderer can actually send and receive a stream) rather than with a unit test.

- [ ] **Step 1: Write `src/main/ipc.ts`**

```ts
import { ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";

import { createAnthropicAdapter } from "./providers/anthropic";
import { createOpenAiAdapter } from "./providers/openai";
import { createOpenRouterAdapter } from "./providers/openrouter";
import { createProviderRegistry } from "./providers/registry";
import { createCredentialStore } from "./credential-store";
import { createSessionStore } from "./session-store";
import type { ChatMessage, SessionState } from "../shared/types";

export function registerIpcHandlers(options: {
  userDataPath: string;
  join: (...segments: string[]) => string;
}): { abortAll(): void } {
  const credentials = createCredentialStore({
    safeStorage,
    filePath: options.join(options.userDataPath, "credentials.json"),
  });
  const sessions = createSessionStore(options.join(options.userDataPath, "sessions"));

  const requireCredential = (providerId: string) => async (): Promise<string> => {
    const secret = await credentials.get(providerId);
    if (!secret) throw new Error(`No credential configured for ${providerId}.`);
    return secret;
  };

  const registry = createProviderRegistry([
    createOpenAiAdapter(requireCredential("openai")),
    createAnthropicAdapter(requireCredential("anthropic")),
    createOpenRouterAdapter(requireCredential("openrouter")),
  ]);

  const activeRequests = new Map<string, AbortController>();

  ipcMain.handle("providers:listModels", async (_event, providerId: string) =>
    registry.get(providerId).listModels(),
  );

  ipcMain.handle("credentials:list", async () => credentials.list());
  ipcMain.handle(
    "credentials:set",
    async (_event, payload: { providerId: string; secret: string }) =>
      credentials.set(payload.providerId, payload.secret),
  );
  ipcMain.handle("credentials:delete", async (_event, providerId: string) =>
    credentials.delete(providerId),
  );

  ipcMain.handle("sessions:list", async () => sessions.list());
  ipcMain.handle("sessions:load", async (_event, id: string) => sessions.load(id));
  ipcMain.handle("sessions:save", async (_event, session: SessionState) => sessions.save(session));
  ipcMain.handle("sessions:delete", async (_event, id: string) => sessions.delete(id));

  ipcMain.handle(
    "chat:send",
    async (
      event: IpcMainInvokeEvent,
      payload: {
        requestId: string;
        paneId: string;
        providerId: string;
        modelId: string;
        messages: ChatMessage[];
      },
    ) => {
      const controller = new AbortController();
      activeRequests.set(payload.requestId, controller);
      try {
        const adapter = registry.get(payload.providerId);
        for await (const chunk of adapter.sendMessage({
          model: payload.modelId,
          messages: payload.messages,
          signal: controller.signal,
        })) {
          if (event.sender.isDestroyed()) return;
          event.sender.send("chat:chunk", { requestId: payload.requestId, paneId: payload.paneId, chunk });
        }
      } finally {
        activeRequests.delete(payload.requestId);
      }
    },
  );

  ipcMain.handle("chat:abort", async (_event, requestId: string) => {
    activeRequests.get(requestId)?.abort();
  });

  return {
    abortAll(): void {
      for (const controller of activeRequests.values()) controller.abort();
      activeRequests.clear();
    },
  };
}
```

- [ ] **Step 2: Wire it into `src/main/index.ts`**

Add these imports near the top of `src/main/index.ts`:

```ts
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc";
```

Replace the `void app.whenReady().then(...)` block with:

```ts
void app.whenReady().then(() => {
  registerIpcHandlers({ userDataPath: app.getPath("userData"), join });
  void createMainWindow();
  app.on("activate", () => void createMainWindow());
});
```

- [ ] **Step 3: Verify the app still starts and typechecks**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev`
Expected: Electron window opens showing "Zenith". Close it. (Renderer cannot call these channels yet — Task 11 adds the bridge.)

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/main/index.ts
git commit -m "feat: wire provider, credential, session, and chat-stream IPC handlers"
```

---

### Task 11: Preload bridge

**Files:**
- Create: `src/preload/index.ts` (replace the placeholder from Task 1)
- Modify: `src/renderer/environment.d.ts`

**Interfaces:**
- Consumes: the IPC channel contract from Task 10.
- Produces: `window.zenith` object consumed by the renderer in Tasks 12-13:

```ts
interface ZenithApi {
  providers: { listModels(providerId: string): Promise<Model[]> };
  credentials: {
    list(): Promise<string[]>;
    set(providerId: string, secret: string): Promise<void>;
    delete(providerId: string): Promise<void>;
  };
  sessions: {
    list(): Promise<SessionSummary[]>;
    load(id: string): Promise<SessionState | undefined>;
    save(session: SessionState): Promise<void>;
    delete(id: string): Promise<void>;
  };
  chat: {
    send(request: {
      requestId: string;
      paneId: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
    }): Promise<void>;
    abort(requestId: string): Promise<void>;
    onChunk(
      listener: (payload: { requestId: string; paneId: string; chunk: ChatChunk }) => void,
    ): () => void;
  };
}
```

- [ ] **Step 1: Write `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

import type { ChatChunk, ChatMessage, Model, SessionState } from "../shared/types";
import type { SessionSummary } from "../main/session-store";

const zenithApi = {
  providers: {
    listModels: (providerId: string): Promise<Model[]> =>
      ipcRenderer.invoke("providers:listModels", providerId),
  },
  credentials: {
    list: (): Promise<string[]> => ipcRenderer.invoke("credentials:list"),
    set: (providerId: string, secret: string): Promise<void> =>
      ipcRenderer.invoke("credentials:set", { providerId, secret }),
    delete: (providerId: string): Promise<void> => ipcRenderer.invoke("credentials:delete", providerId),
  },
  sessions: {
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke("sessions:list"),
    load: (id: string): Promise<SessionState | undefined> => ipcRenderer.invoke("sessions:load", id),
    save: (session: SessionState): Promise<void> => ipcRenderer.invoke("sessions:save", session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("sessions:delete", id),
  },
  chat: {
    send: (request: {
      requestId: string;
      paneId: string;
      providerId: string;
      modelId: string;
      messages: ChatMessage[];
    }): Promise<void> => ipcRenderer.invoke("chat:send", request),
    abort: (requestId: string): Promise<void> => ipcRenderer.invoke("chat:abort", requestId),
    onChunk(
      listener: (payload: { requestId: string; paneId: string; chunk: ChatChunk }) => void,
    ): () => void {
      const handler = (_event: unknown, payload: { requestId: string; paneId: string; chunk: ChatChunk }) =>
        listener(payload);
      ipcRenderer.on("chat:chunk", handler);
      return () => ipcRenderer.removeListener("chat:chunk", handler);
    },
  },
};

export type ZenithApi = typeof zenithApi;

contextBridge.exposeInMainWorld("zenith", zenithApi);
```

- [ ] **Step 2: Update `src/renderer/environment.d.ts`**

```ts
import type { ZenithApi } from "../preload/index";

export {};

declare global {
  interface Window {
    zenith: ZenithApi;
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/environment.d.ts
git commit -m "feat: add preload bridge exposing providers, credentials, sessions, and chat streaming"
```

---

### Task 12: Renderer — pane list, prompt bar, and streaming

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/Pane.tsx`
- Create: `src/renderer/PromptBar.tsx`
- Create: `src/renderer/useHarness.ts`

**Interfaces:**
- Consumes: `window.zenith` (Task 11), `buildFanOutMessages`/`estimateTokens` (Task 9), `SessionState`/`PaneState` (Task 2).
- Produces: the interactive harness screen. Session sidebar and memory panel are added on top of this in Task 13 — this task's `useHarness` hook already carries `memoryText`/`memoryEnabled` fields per spec §7 so Task 13 only needs to add UI for them, not new state shape.

This task ships without a unit test up front (UI wiring, per the plan's Global Constraints) and is verified by manually running the app.

- [ ] **Step 1: Write `src/renderer/useHarness.ts`**

```ts
import { useCallback, useRef, useState } from "react";

import { buildFanOutMessages } from "../shared/fan-out";
import { estimateTokens } from "../shared/tokens";
import type { ChatMessage, PaneState, SessionState } from "../shared/types";

function createPane(id: string): PaneState {
  return {
    id,
    name: `Pane ${id.slice(0, 4)}`,
    providerId: "openai",
    modelId: "",
    included: true,
    memoryEnabled: false,
    messages: [],
    promptTokens: 0,
    completionTokens: 0,
  };
}

export function createEmptySession(id: string): SessionState {
  return { id, name: "New session", memoryText: "", panes: [createPane(crypto.randomUUID())], updatedAt: Date.now() };
}

export function useHarness(initial: SessionState) {
  const [session, setSession] = useState<SessionState>(initial);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const addPane = useCallback(() => {
    setSession((current) => ({ ...current, panes: [...current.panes, createPane(crypto.randomUUID())] }));
  }, []);

  const removePane = useCallback((paneId: string) => {
    setSession((current) => ({ ...current, panes: current.panes.filter((pane) => pane.id !== paneId) }));
  }, []);

  const updatePane = useCallback((paneId: string, patch: Partial<PaneState>) => {
    setSession((current) => ({
      ...current,
      panes: current.panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)),
    }));
  }, []);

  const setMemoryText = useCallback((memoryText: string) => {
    setSession((current) => ({ ...current, memoryText }));
  }, []);

  const appendToPane = useCallback((paneId: string, message: ChatMessage) => {
    setSession((current) => ({
      ...current,
      panes: current.panes.map((pane) =>
        pane.id === paneId ? { ...pane, messages: [...pane.messages, message] } : pane,
      ),
    }));
  }, []);

  const streamState = useRef(new Map<string, { requestId: string; text: string }>());

  const ensureChunkListener = useCallback(() => {
    if (unsubscribeRef.current) return;
    unsubscribeRef.current = window.zenith.chat.onChunk(({ requestId, paneId, chunk }) => {
      const state = streamState.current.get(paneId);
      if (!state || state.requestId !== requestId) return;
      state.text += chunk.delta;
      setSession((current) => ({
        ...current,
        panes: current.panes.map((pane) => {
          if (pane.id !== paneId) return pane;
          const messages = [...pane.messages];
          const lastIndex = messages.length - 1;
          if (chunk.delta) {
            if (messages[lastIndex]?.role === "assistant" && state.text !== chunk.delta) {
              messages[lastIndex] = { role: "assistant", content: state.text };
            } else {
              messages.push({ role: "assistant", content: chunk.delta });
            }
          }
          return {
            ...pane,
            messages,
            completionTokens: chunk.done ? estimateTokens(state.text) : pane.completionTokens,
          };
        }),
      }));
    });
  }, []);

  const sendToPane = useCallback(
    (pane: PaneState, prompt: string) => {
      if (!pane.modelId) return;
      ensureChunkListener();
      const requestId = crypto.randomUUID();
      streamState.current.set(pane.id, { requestId, text: "" });
      const outgoing = buildFanOutMessages(pane, prompt, session.memoryText);
      updatePane(pane.id, {
        messages: [...pane.messages, { role: "user", content: prompt }],
        promptTokens: pane.promptTokens + estimateTokens(outgoing.map((m) => m.content).join("\n")),
      });
      void window.zenith.chat.send({
        requestId,
        paneId: pane.id,
        providerId: pane.providerId,
        modelId: pane.modelId,
        messages: outgoing,
      });
    },
    [session.memoryText, updatePane, ensureChunkListener],
  );

  const sendPrompt = useCallback(
    (prompt: string) => {
      for (const pane of session.panes) {
        if (pane.included) sendToPane(pane, prompt);
      }
    },
    [session.panes, sendToPane],
  );

  return {
    session,
    setSession,
    addPane,
    removePane,
    updatePane,
    setMemoryText,
    appendToPane,
    sendPrompt,
    sendToPane,
  };
}
```

- [ ] **Step 2: Write `src/renderer/Pane.tsx`**

```tsx
import { useEffect, useState } from "react";

import type { Model, PaneState } from "../shared/types";

const PROVIDER_IDS = ["openai", "anthropic", "openrouter"] as const;

export function Pane(props: {
  pane: PaneState;
  onChange(patch: Partial<PaneState>): void;
  onRemove(): void;
  onSend(prompt: string): void;
}) {
  const { pane, onChange, onRemove, onSend } = props;
  const [models, setModels] = useState<Model[]>([]);
  const [reply, setReply] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.zenith.providers.listModels(pane.providerId).then((list) => {
      if (!cancelled) setModels(list);
    });
    return () => {
      cancelled = true;
    };
  }, [pane.providerId]);

  return (
    <div style={{ border: "1px solid #333", borderRadius: 8, padding: 12, minWidth: 320, flex: "0 0 320px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={pane.included}
          onChange={(event) => onChange({ included: event.target.checked })}
          title="Include in next fan-out send"
        />
        <input
          value={pane.name}
          onChange={(event) => onChange({ name: event.target.value })}
          style={{ flex: 1 }}
        />
        <button onClick={onRemove}>Delete</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select
          value={pane.providerId}
          onChange={(event) => onChange({ providerId: event.target.value, modelId: "" })}
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select value={pane.modelId} onChange={(event) => onChange({ modelId: event.target.value })}>
          <option value="">Select model…</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </div>
      <label style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={pane.memoryEnabled}
          onChange={(event) => onChange({ memoryEnabled: event.target.checked })}
        />
        Use session memory
      </label>
      <div style={{ height: 320, overflowY: "auto", background: "#0d0d0f", padding: 8, borderRadius: 6 }}>
        {pane.messages.map((message, index) => (
          <div key={index} style={{ marginBottom: 8 }}>
            <strong>{message.role}: </strong>
            <span>{message.content}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && reply.trim()) {
              onSend(reply);
              setReply("");
            }
          }}
          placeholder="Reply to just this pane…"
          style={{ flex: 1 }}
        />
        <button
          onClick={() => {
            if (!reply.trim()) return;
            onSend(reply);
            setReply("");
          }}
        >
          Send
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
        {pane.promptTokens + pane.completionTokens} tokens ({pane.promptTokens} prompt / {pane.completionTokens} completion)
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/renderer/PromptBar.tsx`**

```tsx
import { useState } from "react";

export function PromptBar(props: { totalTokens: number; onSend(prompt: string): void }) {
  const [prompt, setPrompt] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 12, borderBottom: "1px solid #333" }}>
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && prompt.trim()) {
            props.onSend(prompt);
            setPrompt("");
          }
        }}
        placeholder="Send one prompt to every included pane…"
        style={{ flex: 1, padding: 8 }}
      />
      <button
        onClick={() => {
          if (!prompt.trim()) return;
          props.onSend(prompt);
          setPrompt("");
        }}
      >
        Send
      </button>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{props.totalTokens} tokens (session total)</span>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/renderer/App.tsx`**

```tsx
import { createEmptySession, useHarness } from "./useHarness";
import { Pane } from "./Pane";
import { PromptBar } from "./PromptBar";

export function App() {
  const { session, addPane, removePane, updatePane, sendPrompt, sendToPane } = useHarness(
    createEmptySession(crypto.randomUUID()),
  );

  const totalTokens = session.panes.reduce(
    (sum, pane) => sum + pane.promptTokens + pane.completionTokens,
    0,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#101114", color: "#eee" }}>
      <PromptBar totalTokens={totalTokens} onSend={sendPrompt} />
      <div style={{ display: "flex", gap: 12, padding: 12, overflowX: "auto", flex: 1 }}>
        {session.panes.map((pane) => (
          <Pane
            key={pane.id}
            pane={pane}
            onChange={(patch) => updatePane(pane.id, patch)}
            onRemove={() => removePane(pane.id)}
            onSend={(prompt) => sendToPane(pane, prompt)}
          />
        ))}
        <button onClick={addPane} style={{ alignSelf: "flex-start" }}>
          + Add pane
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manually verify fan-out and per-pane replies**

Run: `npm run typecheck && npm run lint`
Expected: PASS

Run: `npm run dev`, then in the running app: add a second pane, set one pane's provider/model to an OpenAI model and the other to an Anthropic model, store real API keys via a temporary `window.zenith.credentials.set("openai", "sk-...")` call from devtools (Task 13 adds a real Settings UI for this — until then, use devtools), type a prompt into the shared prompt bar, and press Send.
Expected: both panes stream independent responses concurrently, and each pane's token line updates once its stream completes.

Then type a follow-up into just one pane's own reply box and send it.
Expected: only that pane receives the follow-up and streams a new response; the other pane is untouched.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/Pane.tsx src/renderer/PromptBar.tsx src/renderer/useHarness.ts
git commit -m "feat: add multi-pane fan-out chat UI with streaming and token stats"
```

---

### Task 13: Renderer — sessions sidebar, memory panel, and credential settings

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/SessionSidebar.tsx`
- Create: `src/renderer/MemoryPanel.tsx`
- Create: `src/renderer/CredentialSettings.tsx`
- Modify: `src/renderer/useHarness.ts`

**Interfaces:**
- Consumes: `window.zenith.sessions.*` and `window.zenith.credentials.*` (Task 11), `session`/`setMemoryText` (Task 12's `useHarness`).
- Produces: full session CRUD in the UI and a real credential-entry screen, removing the devtools workaround from Task 12 Step 5.

- [ ] **Step 1: Add session persistence helpers to `src/renderer/useHarness.ts`**

Add this export alongside the existing `useHarness` hook (append to the bottom of the file):

```ts
export async function persistSession(session: SessionState): Promise<void> {
  await window.zenith.sessions.save({ ...session, updatedAt: Date.now() });
}

export async function loadSessionOrCreate(id: string): Promise<SessionState> {
  const existing = await window.zenith.sessions.load(id);
  return existing ?? createEmptySession(id);
}
```

- [ ] **Step 2: Write `src/renderer/SessionSidebar.tsx`**

```tsx
import { useEffect, useState } from "react";

import type { SessionSummary } from "../main/session-store";

export function SessionSidebar(props: {
  activeSessionId: string;
  onSelect(id: string): void;
  onCreate(): void;
  onDelete(id: string): void;
}) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);

  useEffect(() => {
    window.zenith.sessions.list().then(setSummaries);
  }, [props.activeSessionId]);

  return (
    <div style={{ width: 200, borderRight: "1px solid #333", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <button onClick={props.onCreate}>+ New session</button>
      {summaries.map((summary) => (
        <div key={summary.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => props.onSelect(summary.id)}
            style={{
              flex: 1,
              textAlign: "left",
              fontWeight: summary.id === props.activeSessionId ? "bold" : "normal",
            }}
          >
            {summary.name}
          </button>
          <button onClick={() => props.onDelete(summary.id)} title="Delete session">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/renderer/MemoryPanel.tsx`**

```tsx
export function MemoryPanel(props: { memoryText: string; onChange(value: string): void }) {
  return (
    <div style={{ padding: 12, borderBottom: "1px solid #333" }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
        Memory (prepended to any pane with its memory toggle on)
      </div>
      <textarea
        value={props.memoryText}
        onChange={(event) => props.onChange(event.target.value)}
        rows={3}
        style={{ width: "100%", resize: "vertical" }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write `src/renderer/CredentialSettings.tsx`**

```tsx
import { useEffect, useState } from "react";

const PROVIDER_IDS = ["openai", "anthropic", "openrouter"] as const;

export function CredentialSettings() {
  const [configured, setConfigured] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    window.zenith.credentials.list().then(setConfigured);
  }, []);

  async function save(providerId: string) {
    const secret = drafts[providerId];
    if (!secret) return;
    await window.zenith.credentials.set(providerId, secret);
    setDrafts((current) => ({ ...current, [providerId]: "" }));
    setConfigured(await window.zenith.credentials.list());
  }

  async function remove(providerId: string) {
    await window.zenith.credentials.delete(providerId);
    setConfigured(await window.zenith.credentials.list());
  }

  return (
    <div style={{ padding: 12, borderBottom: "1px solid #333", display: "flex", gap: 12 }}>
      {PROVIDER_IDS.map((providerId) => (
        <div key={providerId} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12 }}>{providerId}</span>
          {configured.includes(providerId) ? (
            <button onClick={() => remove(providerId)}>Clear key</button>
          ) : (
            <>
              <input
                type="password"
                placeholder="API key"
                value={drafts[providerId] ?? ""}
                onChange={(event) => setDrafts((current) => ({ ...current, [providerId]: event.target.value }))}
                style={{ width: 140 }}
              />
              <button onClick={() => save(providerId)}>Save</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire the sidebar, memory panel, and credential settings into `src/renderer/App.tsx`**

```tsx
import { useEffect, useState } from "react";

import { createEmptySession, loadSessionOrCreate, persistSession, useHarness } from "./useHarness";
import { CredentialSettings } from "./CredentialSettings";
import { MemoryPanel } from "./MemoryPanel";
import { Pane } from "./Pane";
import { PromptBar } from "./PromptBar";
import { SessionSidebar } from "./SessionSidebar";

export function App() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const { session, setSession, addPane, removePane, updatePane, setMemoryText, sendPrompt, sendToPane } =
    useHarness(createEmptySession(sessionId));

  useEffect(() => {
    void persistSession(session);
  }, [session]);

  async function selectSession(id: string) {
    const loaded = await loadSessionOrCreate(id);
    setSessionId(id);
    setSession(loaded);
  }

  async function createSession() {
    const id = crypto.randomUUID();
    setSessionId(id);
    setSession(createEmptySession(id));
  }

  async function deleteSession(id: string) {
    await window.zenith.sessions.delete(id);
    if (id === sessionId) await createSession();
  }

  const totalTokens = session.panes.reduce(
    (sum, pane) => sum + pane.promptTokens + pane.completionTokens,
    0,
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#101114", color: "#eee" }}>
      <SessionSidebar
        activeSessionId={sessionId}
        onSelect={selectSession}
        onCreate={createSession}
        onDelete={deleteSession}
      />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <CredentialSettings />
        <MemoryPanel memoryText={session.memoryText} onChange={setMemoryText} />
        <PromptBar totalTokens={totalTokens} onSend={sendPrompt} />
        <div style={{ display: "flex", gap: 12, padding: 12, overflowX: "auto", flex: 1 }}>
          {session.panes.map((pane) => (
            <Pane
              key={pane.id}
              pane={pane}
              onChange={(patch) => updatePane(pane.id, patch)}
              onRemove={() => removePane(pane.id)}
              onSend={(prompt) => sendToPane(pane, prompt)}
            />
          ))}
          <button onClick={addPane} style={{ alignSelf: "flex-start" }}>
            + Add pane
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manually verify session switching and credentials**

Run: `npm run typecheck && npm run lint`
Expected: PASS

Run: `npm run dev`, then: enter a real API key in the credential bar for one provider, create a second session from the sidebar, confirm the new session starts empty with one pane, switch back to the first session and confirm its panes/history are still there, delete a session and confirm it disappears from the sidebar.
Expected: all of the above work without errors in the devtools console.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/SessionSidebar.tsx src/renderer/MemoryPanel.tsx src/renderer/CredentialSettings.tsx src/renderer/useHarness.ts
git commit -m "feat: add session sidebar, memory panel, and credential settings UI"
```

---

### Task 14: Cross-platform packaging

**Files:**
- Modify: `forge.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing (packaging config only).
- Produces: `npm run make` output for win32, darwin, and linux from one config, replacing the previous win32-only maker.

- [ ] **Step 1: Add the darwin and linux maker packages**

Run: `npm install --save-dev @electron-forge/maker-dmg@7.11.2 @electron-forge/maker-deb@7.11.2`
Expected: both added to `devDependencies` in `package.json` and `package-lock.json` at version `7.11.2`, matching the pinned `@electron-forge/cli` version.

- [ ] **Step 2: Update `forge.config.ts` makers and remove the win32-only download-checksum pin**

Replace:

```ts
import { MakerZIP } from "@electron-forge/maker-zip";
```

with:

```ts
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerDeb } from "@electron-forge/maker-deb";
```

Replace:

```ts
  makers: [new MakerZIP({}, ["win32"])],
```

with:

```ts
  makers: [
    new MakerZIP({}, ["win32", "linux"]),
    new MakerDMG({}, ["darwin"]),
    new MakerDeb({}, ["linux"]),
  ],
```

Remove the `download.checksums` block from `packagerConfig` (it pins a win32-only Electron zip checksum, which does not apply when packaging for darwin/linux):

```ts
    download: {
      checksums: {
        "electron-v43.3.0-win32-x64.zip":
          "18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9",
      },
    },
```

- [ ] **Step 3: Verify packaging for the current platform**

Run: `npm run package`
Expected: exits 0 and produces an `out/` directory containing a packaged app for the platform you're running this on.

Run: `npm run make`
Expected: exits 0 and produces platform-appropriate installers/archives under `out/make/` (a `.zip` on win32/linux, a `.dmg` on darwin, a `.deb` on linux).

- [ ] **Step 4: Commit**

```bash
git add forge.config.ts package.json package-lock.json
git commit -m "feat: package the harness for win32, darwin, and linux from one Forge config"
```
