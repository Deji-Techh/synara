// apps/web/src/main.tsx — Pure Caide app shell with code splitting
import { lazy, Suspense, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ToastContainer } from "./components/Toast";

// Code splitting — lazy load heavy components
const ChatView = lazy(() => import("./components/ChatView"));
const CreateAppDialog = lazy(() => import("./components/CreateAppDialog"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));

// Loading skeleton
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function AppShell() {
  const [selectedThread, setSelectedThread] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden">
      <Sidebar
        onSelectThread={setSelectedThread}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCreateProject={() => setShowCreateProject(true)}
        selectedThread={selectedThread}
      />
      <Suspense fallback={
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      }>
        <ChatView
          threadId={selectedThread}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCreateProject={() => setShowCreateProject(true)}
        />
      </Suspense>
      {showCreateProject && (
        <Suspense fallback={null}>
          <CreateAppDialog onClose={() => setShowCreateProject(false)} onSelect={() => { setShowCreateProject(false); }} />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPage onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
      <ToastContainer />
    </div>
  );
}

function App() {
  return <AppShell />;
}

const root = document.getElementById("root");
if (root) {
  const { createRoot } = await import("react-dom/client");
  createRoot(root).render(<App />);
}
