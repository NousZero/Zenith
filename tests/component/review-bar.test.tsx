import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { ReviewBar } from "../../src/renderer/AgentPanel";
import type { AgentTurn } from "../../src/renderer/useHarness";

const turn: AgentTurn = {
  turnId: "turn-1",
  todos: [],
  rolledBack: null,
  snapshot: false,
  activities: [
    { id: "a", tool: "Edit", title: "Edit README.md", status: "done", checkpoint: true },
    { id: "b", tool: "Write", title: "Write notes.md", status: "done", checkpoint: true },
  ],
};

beforeEach(() => {
  Object.defineProperty(window, "zenith", {
    configurable: true,
    value: {
      workspace: {
        gitStatus: vi.fn().mockResolvedValue({
          isRepository: true,
          branch: "main",
          files: [
            { path: "README.md", state: "modified", staged: false },
            { path: "notes.md", state: "untracked", staged: false },
          ],
        }),
        gitDiff: vi.fn((_project: string, path: string) =>
          Promise.resolve(`--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+changed ${path}\n`),
        ),
      },
    },
  });
});

function renderBar(onKeep = vi.fn()) {
  render(
    <ReviewBar
      turn={turn}
      projectPath="/tmp/demo-project"
      onRollback={() => Promise.resolve()}
      onRollbackFile={() => Promise.resolve(true)}
      onKeep={onKeep}
      onShowDiff={() => undefined}
    />,
  );
  return onKeep;
}

test("a file chip expands its diff inline, switches to another file, and collapses", async () => {
  renderBar();
  const readme = screen.getByRole("button", { name: "README.md" });
  const notes = screen.getByRole("button", { name: "notes.md" });
  expect(readme).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(readme);
  expect(readme).toHaveAttribute("aria-expanded", "true");
  const region = screen.getByRole("region", { name: "Diff of README.md" });
  expect(readme).toHaveAttribute("aria-controls", region.id);
  expect(await screen.findByText("+changed README.md")).toBeInTheDocument();
  expect(window.zenith.workspace.gitDiff).toHaveBeenCalledWith(
    "/tmp/demo-project",
    "README.md",
    "modified",
  );

  fireEvent.click(notes);
  expect(readme).toHaveAttribute("aria-expanded", "false");
  expect(notes).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByText("+changed notes.md")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Diff of README.md" })).not.toBeInTheDocument();

  fireEvent.click(notes);
  expect(notes).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("region", { name: "Diff of notes.md" })).not.toBeInTheDocument();
});

test("a folder that isn't a Git repository gets a note instead of a diff", async () => {
  vi.mocked(window.zenith.workspace.gitStatus).mockResolvedValue({
    isRepository: false,
    branch: "",
    files: [],
  });
  renderBar();
  fireEvent.click(screen.getByRole("button", { name: "README.md" }));
  expect(await screen.findByText(/not a Git repository/)).toBeInTheDocument();
});

test("Cmd/Ctrl+Shift+K keeps the changes, and plain Cmd/Ctrl+K does not", () => {
  const onKeep = renderBar();
  fireEvent.keyDown(window, { key: "k", metaKey: true, ctrlKey: true });
  expect(onKeep).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "K", metaKey: true, ctrlKey: true, shiftKey: true });
  expect(onKeep).toHaveBeenCalledTimes(1);
});
