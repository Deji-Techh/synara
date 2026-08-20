import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "@fontsource-variable/jetbrains-mono";
import "./index.css";

import { appHistory } from "./appNavigation";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { isElectron } from "./env";
import { isMacPlatform } from "./lib/utils";

// Global catch-all for provider/theme excision fallout: log and keep the app alive.
// Without this, a single `undefined.map` or `darkSeed` from an old DB/localStorage crashes the whole shell.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // eslint-disable-next-line no-console
    console.error("[caide] window.onerror", event.error ?? event.message, {
      filename: (event as any).filename,
      lineno: (event as any).lineno,
    });
    // Prevent the default "Something went wrong" overlay from remounting the root.
    event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    // eslint-disable-next-line no-console
    console.error("[caide] unhandledrejection", event.reason);
    event.preventDefault();
  });
}

class CaideErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  state = { hasError: false, error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }
  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[caide] React ErrorBoundary", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Caide hit an unexpected error</h1>
          <p style={{ color: "#666", marginTop: 8 }}>
            The app caught a render error and stayed alive so you can try again or reload. Details
            are in the console and in <code>~/.caide/userdata/logs</code>.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#f6f6f6",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 12,
            }}
          >
            {String((this.state.error as any)?.stack ?? this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: "8px 12px" }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginLeft: 8, padding: "8px 12px" }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const router = getRouter(appHistory);

document.title = APP_DISPLAY_NAME;

if (isElectron) {
  document.documentElement.dataset.runtime = "electron";
  // macOS desktop windows are transparent vibrancy windows (see getWindowMaterialOptions
  // in apps/desktop), and Chromium cannot render `backdrop-filter` inside transparent
  // windows — frosted surfaces must fall back to a more opaque fill (see index.css).
  if (isMacPlatform(navigator.platform)) {
    document.documentElement.dataset.windowTransparent = "true";
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaideErrorBoundary>
      <RouterProvider router={router} />
    </CaideErrorBoundary>
  </React.StrictMode>,
);
