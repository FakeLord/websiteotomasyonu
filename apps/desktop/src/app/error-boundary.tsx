import { Component, type ErrorInfo, type ReactNode } from "react";
import { error as logError } from "@tauri-apps/plugin-log";
import { tr } from "../i18n/tr";
import { Button } from "../components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void logError(`${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
          <h1 className="text-xl font-semibold text-text">{tr.errorBoundary.title}</h1>
          <p className="max-w-md text-sm text-muted">{tr.errorBoundary.description}</p>
          <Button onClick={() => window.location.reload()}>{tr.errorBoundary.reload}</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
