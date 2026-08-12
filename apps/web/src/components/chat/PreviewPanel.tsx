// FILE: PreviewPanel.tsx
// Purpose: Right-dock pane that previews the engine-served Flutter app for a
//          thread: start/stop/reload controls, device-frame presets, an iframe
//          view, and a collapsible `flutter run` console.
// Layer: Chat right-dock UI
// Depends on: previewPanel.logic (pure state machine), wsNativeApi.preview RPC.
//
// The engine owns the `flutter run` process and emits no events, so while the
// pane is visible it polls `preview.getState` (~1s) and merges snapshots into
// the machine. Pane close does not stop the preview: the engine keeps serving
// it until the thread session ends, so reopening the pane rehydrates from the
// first poll.

import { type ThreadId } from "@caide/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureNativeApi } from "~/nativeApi";
import type { PreviewDeviceId, RightDockPane } from "~/rightDockStore.logic";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DeviceRecordStopIcon,
  ExternalLinkIcon,
  LoaderIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TerminalIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import {
  createInitialPreviewPanelState,
  mergeEnginePreviewState,
  previewDeviceChanged,
  previewReloadRequested,
  previewStartFailed,
  previewStartRequested,
  previewStarted,
  type PreviewPanelState,
} from "./previewPanel.logic";

const PREVIEW_POLL_INTERVAL_MS = 1_000;

const PREVIEW_DEVICE_OPTIONS: readonly { id: PreviewDeviceId; label: string }[] = [
  { id: "mobile", label: "Mobile" },
  { id: "tablet", label: "Tablet" },
  { id: "desktop", label: "Desktop" },
];

// Screen-like viewport for the framed presets; desktop is fluid.
const DEVICE_VIEWPORT: Record<PreviewDeviceId, { width: number; height: number } | null> = {
  mobile: { width: 375, height: 680 },
  tablet: { width: 690, height: 900 },
  desktop: null,
};

function StatusPill({ state }: { state: PreviewPanelState }) {
  const live = state.status === "starting" || state.status === "running";
  const dotClassName =
    state.status === "running"
      ? "bg-emerald-500"
      : state.status === "starting"
        ? "bg-amber-500"
        : state.status === "failed"
          ? "bg-red-500"
          : "bg-muted-foreground";
  const label =
    state.status === "starting"
      ? "Starting…"
      : state.status === "running"
        ? "Running"
        : state.status === "failed"
          ? "Failed"
          : "Idle";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      title={state.status === "failed" && state.error ? state.error : label}
    >
      <span
        className={cn("size-1.5 rounded-full", dotClassName, live && "animate-pulse")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function PreviewEmptyState(props: { onStart: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">
      <p className="text-sm text-muted-foreground">
        Preview is idle. Start the Flutter preview server to see the app.
      </p>
      <button
        type="button"
        onClick={props.onStart}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        <PlayIcon aria-hidden="true" className="size-3.5" />
        Start preview
      </button>
    </div>
  );
}

function PreviewStartingState() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6">
      <LoaderIcon aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Starting Flutter preview…</p>
    </div>
  );
}

function PreviewFailedState(props: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">
      <p className="max-w-full break-words text-center text-sm text-red-600 dark:text-red-400">
        {props.error ?? "The preview failed to start."}
      </p>
      <button
        type="button"
        onClick={props.onRetry}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        <RefreshCwIcon aria-hidden="true" className="size-3.5" />
        Retry
      </button>
    </div>
  );
}

function PreviewDeviceFrame(props: {
  deviceId: PreviewDeviceId;
  url: string;
  reloadToken: number;
}) {
  const viewport = DEVICE_VIEWPORT[props.deviceId];
  const iframeClassName = props.deviceId === "desktop" ? "h-full w-full" : "h-full w-full border-0";
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      {viewport === null ? (
        <iframe
          key={props.reloadToken}
          src={props.url}
          title="Flutter preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          className={iframeClassName}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-[2rem] border-4 border-muted-foreground/60 bg-black p-2 shadow-lg"
          style={{ width: viewport.width + 32, height: viewport.height + 32 }}
        >
          <div
            className="relative overflow-hidden rounded-[1.6rem] bg-white"
            style={{ width: viewport.width, height: viewport.height }}
          >
            {props.deviceId === "mobile" && (
              <div
                className="absolute left-1/2 top-1.5 z-10 h-1 w-16 -translate-x-1/2 rounded-full bg-black"
                aria-hidden="true"
              />
            )}
            <iframe
              key={props.reloadToken}
              src={props.url}
              title="Flutter preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewConsole(props: { isOpen: boolean; onToggle: () => void; logs: readonly string[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const { logs, isOpen } = props;
  useEffect(() => {
    if (!isOpen || listRef.current === null) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [logs, isOpen]);

  const latestLine = logs.at(-1) ?? "No output yet.";
  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        aria-expanded={isOpen}
      >
        <TerminalIcon aria-hidden="true" className="size-3.5" />
        <span>Console</span>
        {!isOpen && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground/70">{latestLine}</span>
        )}
        {isOpen ? (
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <ChevronUpIcon aria-hidden="true" className="size-3.5" />
        )}
      </button>
      {isOpen && (
        <div
          ref={listRef}
          className="max-h-40 min-h-0 overflow-y-auto bg-muted/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          {logs.length === 0 ? (
            <p>Waiting for `flutter run` output…</p>
          ) : (
            logs.map((line, index) => (
              <p key={index} className="break-words whitespace-pre-wrap">
                {line}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PreviewPanel(props: {
  threadId: ThreadId;
  pane: RightDockPane;
  /**
   * When false the pane is mounted but hidden (another dock tab is active or
   * the dock is collapsed), which pauses the state poll.
   */
  isVisible: boolean;
  onUpdatePane: (patch: { previewDeviceId: PreviewDeviceId }) => void;
  onClose?: (() => void) | undefined;
}) {
  const [panelState, setPanelState] = useState<PreviewPanelState>(() =>
    createInitialPreviewPanelState(props.pane.previewDeviceId ?? "mobile"),
  );
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  useEffect(() => {
    setPanelState((previous) =>
      previewDeviceChanged(previous, props.pane.previewDeviceId ?? "mobile"),
    );
  }, [props.pane.previewDeviceId]);

  const pollOnce = useCallback(() => {
    ensureNativeApi()
      .preview.getState({ threadId: props.threadId })
      .then((snapshot) => {
        setPanelState((previous) =>
          mergeEnginePreviewState(previous, {
            running: snapshot.running,
            url: snapshot.url,
            logs: snapshot.logs,
          }),
        );
      })
      .catch(() => {
        // A transient poll failure (e.g. the server reconnecting) should not
        // tear down the pane; the machine keeps its last known state and the
        // next tick retries. A genuinely stopped preview reports running:false
        // as a *successful* response, so errors only mean transport trouble.
      });
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) {
      return;
    }
    pollOnce();
    const timer = window.setInterval(pollOnce, PREVIEW_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [props.isVisible, pollOnce]);

  const handleStart = useCallback(() => {
    setPanelState((previous) => previewStartRequested(previous));
    ensureNativeApi()
      .preview.start({ threadId: props.threadId })
      .then((result) => {
        setPanelState((previous) => previewStarted(previous, result.url, []));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The preview failed to start.";
        setPanelState((previous) => previewStartFailed(previous, message));
      });
  }, [props.threadId]);

  const handleStop = useCallback(() => {
    void ensureNativeApi().preview.stop({ threadId: props.threadId });
  }, [props.threadId]);

  const handleReload = useCallback(
    (hotReload: boolean) => {
      setPanelState((previous) => previewReloadRequested(previous));
      void ensureNativeApi().preview.reload({ threadId: props.threadId, hotReload });
    },
    [props.threadId],
  );

  const handleDeviceChange = useCallback(
    (deviceId: PreviewDeviceId) => {
      setPanelState((previous) => previewDeviceChanged(previous, deviceId));
      props.onUpdatePane({ previewDeviceId: deviceId });
    },
    [props.onUpdatePane],
  );

  const isStarting = panelState.status === "starting";
  const isRunning = panelState.status === "running";
  const showConsole = isStarting || isRunning || panelState.status === "failed";

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="preview-pane">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          data-testid="preview-start-stop-button"
          onClick={isRunning ? handleStop : handleStart}
          disabled={isStarting}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            isRunning
              ? "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
              : "bg-foreground text-background hover:opacity-90",
            isStarting && "cursor-wait opacity-60",
          )}
        >
          {isRunning ? (
            <>
              <DeviceRecordStopIcon aria-hidden="true" className="size-3.5" />
              Stop
            </>
          ) : (
            <>
              {isStarting ? (
                <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <PlayIcon aria-hidden="true" className="size-3.5" />
              )}
              Start
            </>
          )}
        </button>
        {isRunning && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid="preview-reload-button"
              title="Hot reload (r)"
              aria-label="Hot reload"
              onClick={() => handleReload(true)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RefreshCwIcon aria-hidden="true" className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="preview-restart-button"
              title="Hot restart (R)"
              aria-label="Hot restart"
              onClick={() => handleReload(false)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        )}
        <StatusPill state={panelState} />
        <div className="min-w-0 flex-1" />
        <div
          className="flex shrink-0 items-center gap-0.5"
          role="radiogroup"
          aria-label="Device preset"
        >
          {PREVIEW_DEVICE_OPTIONS.map((option) => {
            const isSelected = panelState.deviceId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleDeviceChange(option.id)}
                className={cn(
                  "rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                  isSelected
                    ? "text-foreground underline decoration-2 underline-offset-2"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {isRunning && panelState.url !== null && (
          <a
            href={panelState.url}
            target="_blank"
            rel="noreferrer"
            title="Open in a new tab"
            aria-label="Open in a new tab"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {panelState.status === "idle" && <PreviewEmptyState onStart={handleStart} />}
        {panelState.status === "starting" && <PreviewStartingState />}
        {panelState.status === "failed" && (
          <PreviewFailedState error={panelState.error} onRetry={handleStart} />
        )}
        {isRunning && panelState.url !== null && (
          <PreviewDeviceFrame
            deviceId={panelState.deviceId}
            url={panelState.url}
            reloadToken={panelState.reloadToken}
          />
        )}
        {isRunning && panelState.url === null && (
          <PanelStateMessage>Preview server did not report a URL.</PanelStateMessage>
        )}
      </div>

      {showConsole && (
        <PreviewConsole
          isOpen={isConsoleOpen}
          onToggle={() => setIsConsoleOpen((open) => !open)}
          logs={panelState.logs}
        />
      )}
    </div>
  );
}

export default PreviewPanel;
