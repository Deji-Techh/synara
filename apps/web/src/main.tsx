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
  const [projectCreated, setProjectCreated] = React.useState<{ projectId: string; threadId: string } | null>(null);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        onSelectThread={setSelectedThread}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCreateProject={() => setShowCreateProject(true)}
        selectedThread={selectedThread}
      />
      <main className="flex-1 min-w-0">
        <ChatView
          threadId={selectedThread}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCreateProject={() => setShowCreateProject(true)}
        />
      </main>
      <CreateAppDialog
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreated={(projectId, threadId) => { setProjectCreated({ projectId, threadId }); setSelectedThread(threadId); setShowCreateProject(false); }}
      />
      <SettingsPage open={showSettings} onClose={() => setShowSettings(false)} />
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
