// FILE: PreviewPanel.tsx
// Purpose: Right-dock pane that previews the engine-served Flutter app for a
//          thread. Beyond the live preview (start/stop/reload controls,
//          device-frame presets, an iframe view, and a collapsible `flutter run`
//          console) it hosts the M5 quality-gate tabs: flutter analyze results
//          (Problems), flutter test results (Tests), a combined Quality Gate,
//          and release builds (Release).
// Layer: Chat right-dock UI
// Depends on: previewPanel.logic (pure state machine), wsNativeApi.preview RPC.
//
// The engine owns the `flutter run` process and emits no events, so while the
// pane is visible it polls `preview.getState` (~1s) and merges snapshots into
// the machine. Pane close does not stop the preview: the engine keeps serving
// it until the thread session ends, so reopening the pane rehydrates from the
// first poll. Release builds poll `preview.buildState` while running.

import { type ThreadId } from "@caide/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureNativeApi } from "~/nativeApi";
import type { PreviewDeviceId, RightDockPane } from "~/rightDockStore.logic";
import {
  ArchiveIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  DeviceRecordStopIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  LoaderIcon,
  ListChecksIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TerminalIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import {
  analyzeFailed,
  analyzeFinished,
  analyzeRequested,
  buildAccepted,
  buildFailed,
  buildRequested,
  createInitialPreviewPanelState,
  mergeBuildState,
  mergeEnginePreviewState,
  previewDeviceChanged,
  previewReloadRequested,
  previewStartFailed,
  previewStartRequested,
  previewStarted,
  previewTabChanged,
  testFailed,
  testFinished,
  testRequested,
  type PreviewAnalyzeState,
  type PreviewBuildState,
  type PreviewPaneTab,
  type PreviewPanelState,
  type PreviewTestState,
} from "./previewPanel.logic";

const PREVIEW_POLL_INTERVAL_MS = 1_000;
const BUILD_POLL_INTERVAL_MS = 1_500;

const PREVIEW_TABS: readonly {
  id: PreviewPaneTab;
  label: string;
  icon: typeof FlaskConicalIcon;
}[] = [
  { id: "preview", label: "Preview", icon: PlayIcon },
  { id: "tests", label: "Tests", icon: FlaskConicalIcon },
  { id: "problems", label: "Problems", icon: BugIcon },
  { id: "qualityGate", label: "Quality", icon: ListChecksIcon },
  { id: "release", label: "Release", icon: ArchiveIcon },
];

const PREVIEW_DEVICE_OPTIONS: readonly { id: PreviewDeviceId; label: string }[] = [
  { id: "mobile", label: "Mobile" },
  { id: "tablet", label: "Tablet" },
  { id: "desktop", label: "Desktop" },
];

const BUILD_TARGET_OPTIONS: readonly { id: "apk" | "appbundle" | "ipa"; label: string }[] = [
  { id: "apk", label: "APK (Android)" },
  { id: "appbundle", label: "AAB (Play Store)" },
  { id: "ipa", label: "IPA (iOS)" },
];

const BUILD_CHANNEL_OPTIONS: readonly { id: "debug" | "profile" | "release"; label: string }[] = [
  { id: "debug", label: "Debug" },
  { id: "profile", label: "Profile" },
  { id: "release", label: "Release" },
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
  threadId: ThreadId;
  deviceId: PreviewDeviceId;
  url: string;
  reloadToken: number;
}) {
  const isNative = !props.url.startsWith("http");
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    let timer: number;
    let cancelled = false;

    const poll = () => {
      ensureNativeApi()
        .preview.screenshot({ threadId: props.threadId })
        .then((res) => {
          if (!cancelled && res.image) {
            setScreenshotBase64(res.image);
          }
        })
        .finally(() => {
          if (!cancelled) {
            timer = window.setTimeout(poll, 1500);
          }
        });
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isNative, props.threadId]);

  const viewport = DEVICE_VIEWPORT[props.deviceId];
  const iframeClassName = props.deviceId === "desktop" ? "h-full w-full" : "h-full w-full border-0";
  
  const innerView = isNative ? (
    screenshotBase64 ? (
      <img
        src={`data:image/png;base64,${screenshotBase64}`}
        alt="Device screenshot"
        className={props.deviceId === "desktop" ? "h-full w-full object-contain" : "h-full w-full object-cover"}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-muted/30">
        <LoaderIcon aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  ) : (
    <iframe
      key={props.reloadToken}
      src={props.url}
      title="Flutter preview"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      className={props.deviceId === "desktop" ? iframeClassName : "h-full w-full border-0"}
    />
  );
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      {viewport === null ? (
        innerView
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
            {innerView}
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

// ── Quality-gate tabs ───────────────────────────────────────────────────────

function ProblemList({ state }: { state: PreviewAnalyzeState }) {
  if (state.running && state.issues.length === 0) {
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
          Running flutter analyze…
        </span>
      </PanelStateMessage>
    );
  }
  if (state.error !== null) {
    return (
      <PanelStateMessage density="compact" fill="flex">
        <span className="text-red-600 dark:text-red-400">{state.error}</span>
      </PanelStateMessage>
    );
  }
  if (!state.clean && state.issues.length === 0) {
    return <PanelStateMessage density="compact">No analyze results yet.</PanelStateMessage>;
  }
  if (state.issues.length === 0) {
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <CheckIcon aria-hidden="true" className="size-4 text-emerald-500" />
          No issues found.
        </span>
      </PanelStateMessage>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
        {state.issues.map((issue, index) => {
          const location =
            issue.line !== undefined
              ? `${issue.path}:${issue.line}${issue.column !== undefined ? `:${issue.column}` : ""}`
              : issue.path;
          return (
            <div
              key={index}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
              data-testid="analyze-issue-row"
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold text-background",
                  issue.severity === "error" ? "bg-red-500" : "bg-amber-500",
                )}
                title={issue.severity}
              >
                {issue.severity === "error" ? "E" : "W"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words">{issue.message}</p>
                <p className="truncate text-muted-foreground/70">{location}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TestResults({ state }: { state: PreviewTestState }) {
  if (state.running && state.output.length === 0) {
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
          Running flutter test…
        </span>
      </PanelStateMessage>
    );
  }
  if (state.error !== null) {
    return (
      <PanelStateMessage density="compact" fill="flex">
        <span className="text-red-600 dark:text-red-400">{state.error}</span>
      </PanelStateMessage>
    );
  }
  if (state.output.length === 0) {
    return <PanelStateMessage density="compact">No test results yet.</PanelStateMessage>;
  }
  const total = state.passed + state.failed + state.skipped;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CircleAlertIcon aria-hidden="true" className="size-3.5" /> {state.passed} passed
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            state.failed > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          <CircleAlertIcon aria-hidden="true" className="size-3.5" /> {state.failed} failed
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          {state.skipped} skipped
        </span>
        <span className="min-w-0 flex-1" />
        {state.running && (
          <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />
        )}
        <span className="text-muted-foreground/70">{total} total</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {state.output.split("\n").map((line, index) => (
          <p key={index} className="break-words whitespace-pre-wrap">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function QualityGatePanel(props: {
  analyze: PreviewAnalyzeState;
  test: PreviewTestState;
  onRunAnalyze: () => void;
  onRunTest: () => void;
}) {
  const analyzeDirty = props.analyze.clean === null && props.analyze.error === null;
  const testRan = props.test.output.length > 0 || props.test.error !== null;
  const allGreen = props.analyze.clean === true && props.test.failed === 0 && testRan;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      {allGreen && (
        <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckIcon aria-hidden="true" className="size-4" />
          Quality gate passed — no analyzer issues and no failing tests.
        </div>
      )}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <BugIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">flutter analyze</h3>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={props.onRunAnalyze}
            disabled={props.analyze.running}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "bg-foreground text-background hover:opacity-90",
              props.analyze.running && "cursor-wait opacity-60",
            )}
          >
            {props.analyze.running ? (
              <>
                <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <RefreshCwIcon aria-hidden="true" className="size-3.5" /> Run
              </>
            )}
          </button>
        </div>
        {analyzeDirty ? (
          <p className="mt-2 text-xs text-muted-foreground">No analyze run yet.</p>
        ) : props.analyze.error !== null ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{props.analyze.error}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className={props.analyze.clean ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {props.analyze.clean ? "Clean" : `${props.analyze.issues.length} issue(s)`}
            </span>
            {props.analyze.output.trim().length > 0 && (
              <span className="block truncate text-muted-foreground/70">
                {props.analyze.output.trim()}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <FlaskConicalIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">flutter test</h3>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={props.onRunTest}
            disabled={props.test.running}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "bg-foreground text-background hover:opacity-90",
              props.test.running && "cursor-wait opacity-60",
            )}
          >
            {props.test.running ? (
              <>
                <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin" /> Testing…
              </>
            ) : (
              <>
                <RefreshCwIcon aria-hidden="true" className="size-3.5" /> Run
              </>
            )}
          </button>
        </div>
        {testRan ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {props.test.passed} passed · {props.test.failed} failed · {props.test.skipped} skipped
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No test run yet.</p>
        )}
      </div>
    </div>
  );
}

function ReleasePanel(props: {
  build: PreviewBuildState;
  onBuild: (options: {
    target: "apk" | "appbundle" | "ipa";
    channel: "debug" | "profile" | "release";
  }) => void;
}) {
  const [target, setTarget] = useState(props.build.target);
  const [channel, setChannel] = useState(props.build.channel);
  const isRunning = props.build.running;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <ArchiveIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">Build distributable</h3>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Target
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as "apk" | "appbundle" | "ipa")}
              disabled={isRunning}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {BUILD_TARGET_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Channel
            <select
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as "debug" | "profile" | "release")
              }
              disabled={isRunning}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {BUILD_CHANNEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => props.onBuild({ target, channel })}
          disabled={isRunning}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-foreground text-background hover:opacity-90",
            isRunning && "cursor-wait opacity-60",
          )}
        >
          {isRunning ? (
            <>
              <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin" />
              Building…
            </>
          ) : (
            <>
              <ArchiveIcon aria-hidden="true" className="size-3.5" />
              Build {target.toUpperCase()}
            </>
          )}
        </button>
      </div>

      {isRunning && (
        <div className="inline-flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
          Build running — this can take several minutes.
        </div>
      )}
      {props.build.status === "succeeded" && (
        <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckIcon aria-hidden="true" className="size-4" />
          Build succeeded
          {props.build.outputPath !== null && (
            <span className="break-all text-muted-foreground"> {props.build.outputPath}</span>
          )}
        </div>
      )}
      {props.build.status === "failed" && (
        <div className="inline-flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4" />
          <span className="break-all">{props.build.error ?? "Build failed."}</span>
        </div>
      )}

      {props.build.logs.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {props.build.logs.map((line, index) => (
            <p key={index} className="break-words whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pane shell ──────────────────────────────────────────────────────────────

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

  const handleTabChange = useCallback((tab: PreviewPaneTab) => {
    setPanelState((previous) => previewTabChanged(previous, tab));
  }, []);

  const handleRunAnalyze = useCallback(() => {
    setPanelState((previous) => analyzeRequested(previous));
    ensureNativeApi()
      .preview.analyze({ threadId: props.threadId })
      .then((result) => {
        setPanelState((previous) =>
          analyzeFinished(previous, {
            issues: result.issues,
            clean: result.clean,
            output: result.output,
          }),
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "flutter analyze failed.";
        setPanelState((previous) => analyzeFailed(previous, message));
      });
  }, [props.threadId]);

  const handleRunTest = useCallback(() => {
    setPanelState((previous) => testRequested(previous));
    ensureNativeApi()
      .preview.test({ threadId: props.threadId })
      .then((result) => {
        setPanelState((previous) =>
          testFinished(previous, {
            passed: result.passed,
            failed: result.failed,
            skipped: result.skipped,
            output: result.output,
          }),
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "flutter test failed.";
        setPanelState((previous) => testFailed(previous, message));
      });
  }, [props.threadId]);

  const handleBuild = useCallback(
    (options: {
      target: "apk" | "appbundle" | "ipa";
      channel: "debug" | "profile" | "release";
    }) => {
      setPanelState((previous) => buildRequested(previous, options));
      ensureNativeApi()
        .preview.buildStart({
          threadId: props.threadId,
          target: options.target,
          channel: options.channel,
        })
        .then((result) => {
          setPanelState((previous) => buildAccepted(previous, result.buildId));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Build failed to start.";
          setPanelState((previous) => buildFailed(previous, message));
        });
    },
    [props.threadId],
  );

  const pollBuildOnce = useCallback(() => {
    setPanelState((previous) => {
      if (!previous.build.running || previous.build.buildId === null) {
        return previous;
      }
      void ensureNativeApi()
        .preview.buildState({ threadId: props.threadId, buildId: previous.build.buildId })
        .then((snapshot) => {
          setPanelState((current) => mergeBuildState(current, snapshot));
        })
        .catch(() => {
          // Leave the build running; the next poll retries.
        });
      return previous;
    });
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) {
      return;
    }
    pollBuildOnce();
    const timer = window.setInterval(pollBuildOnce, BUILD_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [props.isVisible, pollBuildOnce]);

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

      <div
        className="flex shrink-0 items-center gap-0.5 border-b border-border px-2"
        role="tablist"
        aria-label="Preview pane"
      >
        {PREVIEW_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isSelected = panelState.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`preview-tab-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                isSelected
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <TabIcon aria-hidden="true" className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
        <div className="min-w-0 flex-1" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {panelState.activeTab === "preview" && (
          <>
            {panelState.status === "idle" && <PreviewEmptyState onStart={handleStart} />}
            {panelState.status === "starting" && <PreviewStartingState />}
            {panelState.status === "failed" && (
              <PreviewFailedState error={panelState.error} onRetry={handleStart} />
            )}
            {isRunning && panelState.url !== null && (
              <PreviewDeviceFrame
                threadId={props.threadId}
                deviceId={panelState.deviceId}
                url={panelState.url}
                reloadToken={panelState.reloadToken}
              />
            )}
            {isRunning && panelState.url === null && (
              <PanelStateMessage>Preview server did not report a URL.</PanelStateMessage>
            )}
          </>
        )}
        {panelState.activeTab === "problems" && <ProblemList state={panelState.analyze} />}
        {panelState.activeTab === "tests" && <TestResults state={panelState.test} />}
        {panelState.activeTab === "qualityGate" && (
          <QualityGatePanel
            analyze={panelState.analyze}
            test={panelState.test}
            onRunAnalyze={handleRunAnalyze}
            onRunTest={handleRunTest}
          />
        )}
        {panelState.activeTab === "release" && (
          <ReleasePanel build={panelState.build} onBuild={handleBuild} />
        )}
      </div>

      {panelState.activeTab === "preview" && showConsole && (
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
