// apps/web/src/main.tsx — Pure Caide minimal entry point
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import ChatView from "./components/ChatView";
import { APP_DISPLAY_NAME } from "./branding";

// Error boundary
class CaideErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: unknown }> {
  override state = { hasError: false, error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { hasError: true, error }; }
  override componentDidCatch(error: unknown) { console.error("[caide] error", error); }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
          <h1 className="text-xl font-semibold">Caide hit an unexpected error</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">The app caught a render error. Details in console.</p>
          <pre className="mt-4 max-w-lg overflow-auto rounded-lg bg-muted p-3 text-xs text-left">{String((this.state.error as any)?.stack ?? this.state.error)}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Reload app</button>
        </div>
      );
    }
    return this.props.children;
  }
}

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaideErrorBoundary>
      <ChatView />
    </CaideErrorBoundary>
  </React.StrictMode>,
);
