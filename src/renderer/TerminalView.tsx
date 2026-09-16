import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

// Reads the theme's colors so the terminal matches the rest of the window.
function terminalTheme(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value ? `hsl(${value})` : fallback;
  };
  const foreground = color("--foreground", "#e7e0d2");
  return {
    background: color("--background", "#0d0f0e"),
    foreground,
    cursor: color("--primary", "#d3a553"),
    cursorAccent: color("--background", "#0d0f0e"),
    selectionBackground: color("--accent", "#2a302c"),
    black: color("--muted", "#1c211e"),
    red: color("--danger", "#e07a6a"),
    green: color("--success", "#a7b69a"),
    yellow: color("--warning", "#d3a553"),
    blue: color("--ring", "#e0b360"),
    magenta: color("--primary", "#d3a553"),
    cyan: color("--success", "#a7b69a"),
    white: foreground,
    brightBlack: color("--muted-foreground", "#7e7a70"),
    brightRed: color("--danger", "#e07a6a"),
    brightGreen: color("--success", "#a7b69a"),
    brightYellow: color("--warning", "#d3a553"),
    brightBlue: color("--ring", "#e0b360"),
    brightMagenta: color("--primary", "#d3a553"),
    brightCyan: color("--success", "#a7b69a"),
    brightWhite: foreground,
  };
}

// The workspace terminal: the user's own shell in a pseudo-terminal, so prompts, colors, and
// full-screen programs work. One shell per project folder, kept while Zenith runs.
export function TerminalView(props: { projectPath: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let sessionId: string | undefined;
    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily:
        'Cascadia Code, "SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      theme: terminalTheme(),
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);
    fit.fit();

    const offData = window.zenith.terminal.onData((event) => {
      if (event.id === sessionId) terminal.write(event.data);
    });
    const offExit = window.zenith.terminal.onExit((event) => {
      if (event.id !== sessionId) return;
      sessionId = undefined;
      terminal.writeln(`\r\n[the shell closed with code ${event.code}]`);
    });
    terminal.onData((data) => {
      if (sessionId) void window.zenith.terminal.write(sessionId, data);
    });

    void window.zenith.terminal
      .start(props.projectPath, terminal.cols, terminal.rows)
      .then((id) => {
        if (disposed) {
          void window.zenith.terminal.stop(id);
          return;
        }
        sessionId = id;
        terminal.focus();
      })
      .catch((caught: unknown) =>
        setError(
          (caught instanceof Error ? caught.message : String(caught)).replace(
            /^Error invoking remote method '[^']+': (?:Error: )?/,
            "",
          ),
        ),
      );

    // Keep the shell's size matched to the panel, so full-screen programs draw correctly.
    const resize = new ResizeObserver(() => {
      if (element.clientHeight === 0 || element.clientWidth === 0) return;
      fit.fit();
      if (sessionId) void window.zenith.terminal.resize(sessionId, terminal.cols, terminal.rows);
    });
    resize.observe(element);
    const themes = new MutationObserver(() => (terminal.options.theme = terminalTheme()));
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      disposed = true;
      resize.disconnect();
      themes.disconnect();
      offData();
      offExit();
      if (sessionId) void window.zenith.terminal.stop(sessionId);
      terminal.dispose();
    };
  }, [props.projectPath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  );
}
