import { Component, type ReactNode } from "react";

import { Button } from "./components/ui/button";

// React error boundaries must be class components (no functional equivalent yet). This is the
// last resort when a render throws somewhere below it: log it locally and offer a reload instead
// of leaving a blank window.
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    void window.zenith.log.report(error.message, error.stack);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-center text-foreground">
        <p className="text-sm font-medium">Something went wrong.</p>
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
