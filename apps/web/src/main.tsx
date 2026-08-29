// apps/web/src/main.tsx — Pure Caide entry point
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import ChatView from "./components/ChatView";
import { Sidebar } from "./components/Sidebar";
import { CreateAppDialog } from "./components/CreateAppDialog";
import { SettingsPage } from "./components/SettingsPage";
import { APP_DISPLAY_NAME } from "./branding";

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

function App() {
  const [selectedThread, setSelectedThread] = React.useState<string | undefined>(undefined);
  const [showCreateProject, setShowCreateProject] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [onboardingSeen, setOnboardingSeen] = React.useState(() => {
    try { return localStorage.getItem("caide:onboarding:seen") === "true"; } catch { return true; }
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        onSelectThread={setSelectedThread}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCreateProject={() => setShowCreateProject(true)}
        selectedThread={selectedThread}
      />
      <main className="flex-1 min-w-0">
        {selectedThread ? (
          <ChatView
            threadId={selectedThread}
            onOpenSettings={() => setShowSettings(true)}
            onOpenCreateProject={() => setShowCreateProject(true)}
          />
        ) : (
          <EmptyState
            hasProjects={false}
            onOpenCreateProject={() => setShowCreateProject(true)}
            onDismissOnboarding={() => { try { localStorage.setItem("caide:onboarding:seen", "true"); } catch {} setOnboardingSeen(true); }}
            onboardingSeen={onboardingSeen}
          />
        )}
      </main>
      <CreateAppDialog
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreated={(projectId, threadId) => { setSelectedThread(threadId); setShowCreateProject(false); }}
      />
      <SettingsPage open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function EmptyState({ hasProjects, onOpenCreateProject, onDismissOnboarding, onboardingSeen }: { hasProjects: boolean; onOpenCreateProject: () => void; onDismissOnboarding: () => void; onboardingSeen: boolean }) {
  if (!onboardingSeen) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Caide</h1>
        <div className="flex flex-col gap-4 max-w-sm text-center text-sm text-muted-foreground">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-foreground mb-1">1. Create a project</p>
            <p className="text-xs">Click "+ New project" in the sidebar to pick a framework.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-foreground mb-1">2. Describe what to build</p>
            <p className="text-xs">Type in the composer pill below — e.g. "Login screen with empty state".</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-foreground mb-1">3. Watch it generate</p>
            <p className="text-xs">Real provider streaming via /api/harness/stream shows code being built.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-foreground mb-1">4. Preview the result</p>
            <p className="text-xs">Live preview verifies the app before you ship it.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenCreateProject} className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Get started</button>
          <button type="button" onClick={onDismissOnboarding} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent">Skip</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <h1 className="text-2xl font-bold tracking-tight">No project selected</h1>
      <p className="max-w-md text-sm text-muted-foreground text-center">Select a project from the sidebar, or create a new one.</p>
      <button type="button" onClick={onOpenCreateProject} className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">+ New project</button>
    </div>
  );
}

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CaideErrorBoundary>
      <App />
    </CaideErrorBoundary>
  </React.StrictMode>,
);
