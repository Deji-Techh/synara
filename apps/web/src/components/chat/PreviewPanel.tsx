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
import {
  selectThreadFrameKind,
  useDeviceStateStore,
  type PreviewFrameKind,
} from "../../deviceStateStore";
import { DeviceScreen, type DeviceKind } from "../device/DeviceFrame";
import {
  DeviceControlRail,
  type DeviceRailAction,
} from "../device/DeviceControlRail";

import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";
import { toastManager } from "../ui/toast";
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

/**
 * The frame switcher drives the chassis (and the frameless view) the live
 * preview renders in. The mapped device presets keep the pane's existing
 * deviceId state (view sizing, status machine) in sync without touching its
 * shape: androidPhone and iPhone share the mobile viewport, iPad the tablet
 * viewport, and frameless maps to the fluid desktop view.
 */
const FRAME_KIND_TO_DEVICE_ID: Record<PreviewFrameKind, PreviewDeviceId> = {
  androidPhone: "mobile",
  iPhone: "mobile",
  iPad: "tablet",
  frameless: "desktop",
};

const FRAME_KIND_TO_FLUTTER_DEVICE: Record<PreviewFrameKind, "web-server" | "emulator" | "simulator"> = {
  androidPhone: "emulator",
  iPhone: "simulator",
  iPad: "simulator",
  frameless: "web-server",
};

const DEVICE_ID_FRAME_KIND_FALLBACK: Record<PreviewDeviceId, PreviewFrameKind> = {
  mobile: "iPhone",
  tablet: "iPad",
  desktop: "frameless",
};

const FRAME_KIND_OPTIONS: readonly { id: PreviewFrameKind; label: string }[] = [
  { id: "androidPhone", label: "Android phone" },
  { id: "iPhone", label: "iPhone" },
  { id: "iPad", label: "Tablet" },
  { id: "frameless", label: "Frameless" },
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

function FlutterToolchainBanner(props: { threadId: ThreadId }) {
  const [status, setStatus] = useState<{
    supported: boolean;
    installed: boolean;
    version: string;
    estimatedDownloadBytes: number;
    unsupportedReason: string | null;
  } | null>(null);
  const [progress, setProgress] = useState<{
    phase: string;
    percent: number;
    componentPercent: number;
    downloadedBytes: number;
    totalBytes: number | null;
    message: string;
  } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    (ensureNativeApi() as unknown as { preview: { flutterToolchainStatus: (i: { threadId: ThreadId }) => Promise<never> } }).preview
      .flutterToolchainStatus({ threadId: props.threadId })
      .then((res: unknown) => {
        const r = res as { supported: boolean; installed: boolean; version: string; estimatedDownloadBytes: number; unsupportedReason: string | null };
        setStatus(r);
      })
      .catch(() => {});
  }, [props.threadId]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Poll progress via status while installing (engine emits progress via logs, but status percent drives bar)
  useEffect(() => {
    if (!installing) return;
    const iv = window.setInterval(() => {
      // While installing, re-use status polling for fallback + try to read engine logs for progress percent
      refresh();
    }, 1000);
    return () => window.clearInterval(iv);
  }, [installing, refresh]);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    setError(null);
    setProgress({ phase: "preparing", percent: 1, componentPercent: 0, downloadedBytes: 0, totalBytes: status?.estimatedDownloadBytes ?? null, message: "Preparing Flutter SDK…" });
    (ensureNativeApi() as unknown as { preview: { flutterToolchainInstall: (i: { threadId: ThreadId }) => Promise<unknown> } }).preview
      .flutterToolchainInstall({ threadId: props.threadId })
      .then(() => {
        setInstalling(false);
        setProgress({ phase: "done", percent: 100, componentPercent: 100, downloadedBytes: status?.estimatedDownloadBytes ?? 0, totalBytes: status?.estimatedDownloadBytes ?? null, message: "Flutter SDK ready." });
        toastManager.add({ type: "success", title: "Flutter SDK installed", description: "Flutter is ready to build and preview." });
        refresh();
        window.setTimeout(() => setProgress(null), 3000);
      })
      .catch((e: unknown) => {
        setInstalling(false);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastManager.add({ type: "error", title: "Flutter install failed", description: msg.slice(0, 300) });
      });
  }, [props.threadId, status?.estimatedDownloadBytes, refresh]);

  if (!status) return null;
  if (status.installed && !installing && !progress) return null;
  if (!status.supported) {
    return (
      <div className="mx-3 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Flutter auto-install is not available on this platform. Please install Flutter manually.
        {status.unsupportedReason && <span className="block text-amber-600/80">{status.unsupportedReason}</span>}
      </div>
    );
  }

  const pct = progress ? Math.round(progress.percent) : 0;
  const downloaded = progress ? `${(progress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB${progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB` : ""}` : null;

  return (
    <div className="mx-3 mt-3 rounded-md border border-border bg-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <LoaderIcon aria-hidden="true" className={cn("size-3.5 text-muted-foreground", installing && "animate-spin")} />
        <span className="text-xs font-medium">
          {installing ? progress?.message ?? "Installing Flutter SDK…" : !status.installed ? `Flutter ${status.version} not installed` : "Flutter SDK"}
        </span>
        <span className="min-w-0 flex-1" />
        {!status.installed && !installing && (
          <button type="button" onClick={handleInstall} className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90">
            Download {status.version}
          </button>
        )}
        {installing && <span className="text-xs text-muted-foreground">{pct}%</span>}
      </div>
      {(installing || progress) && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground transition-all duration-300" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate">{progress?.message ?? ""}</span>
            {downloaded && <span className="ml-2 shrink-0">{downloaded}</span>}
          </div>
        </div>
      )}
      {error && <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!installing && !status.installed && status.estimatedDownloadBytes > 0 && !progress && (
        <p className="mt-1 text-[11px] text-muted-foreground">~{(status.estimatedDownloadBytes / (1024 * 1024)).toFixed(0)} MB download. Progress shows above during install.</p>
      )}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

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
  frameKind: PreviewFrameKind;
  url: string;
  reloadToken: number;
  landscape: boolean;
  onRotate: () => void;
  onScreenshot: () => void;
  onRailAction: (action: DeviceRailAction) => void;
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

  const innerView = isNative ? (
    screenshotBase64 ? (
      <img
        src={`data:image/png;base64,${screenshotBase64}`}
        alt="Device screenshot"
        className="h-full w-full object-cover"
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
      className="h-full w-full border-0"
    />
  );

  // Frameless is the fluid full-bleed view: no chassis and no rail, just the
  // live surface sized to the pane.
  if (props.frameKind === "frameless") {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {innerView}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center overflow-auto p-4 py-8">
      <div className="flex shrink-0 flex-col items-center gap-4">
        <DeviceScreen kind={props.frameKind} landscape={props.landscape}>
          {innerView}
        </DeviceScreen>
        <DeviceControlRail
          disabled={false}
          recording={false}
          landscape={props.landscape}
          onAction={props.onRailAction}
        />
      </div>
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
  const [landscape, setLandscape] = useState(false);

  // The chassis choice is persisted per thread (survives the pane closing and
  // reopening); when nothing is stored yet it falls back to the pane's device
  // preset so an untouched pane renders the same frame it always did.
  const threadFrameKind = useDeviceStateStore(selectThreadFrameKind(props.threadId));
  const setFrameKind = useDeviceStateStore((store) => store.setFrameKind);
  const frameKind: PreviewFrameKind = threadFrameKind ?? DEVICE_ID_FRAME_KIND_FALLBACK[panelState.deviceId];
  // Status states (idle/starting/failed) always draw inside a chassis — there
  // is no frameless "device" to hang a prompt or spinner on — so frameless
  // falls back to the iPhone silhouette rather than showing an empty pane.
  const statusFrameKind: DeviceKind = frameKind === "frameless" ? "iPhone" : frameKind;

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

  const handleFrameKindChange = useCallback(
    (kind: PreviewFrameKind) => {
      setFrameKind(props.threadId, kind);
      setLandscape(false);
      handleDeviceChange(FRAME_KIND_TO_DEVICE_ID[kind]);
      if (panelState.status === "idle" || panelState.status === "failed") {
        handleStart();
      }
    },
    [setFrameKind, props.threadId, handleDeviceChange, handleStart, panelState.status],
  );

  // The preview pane has no simulator session to relay touch input to, so the
  // rail's device actions stay honest: screenshot and rotate work against the
  // engine-served frame, and everything wired to the iOS Simulator pane points
  // the user somewhere it can actually run.
  const savePreviewScreenshot = useCallback(() => {
    ensureNativeApi()
      .preview.screenshot({ threadId: props.threadId })
      .then((result) => {
        if (!result.image) {
          toastManager.add({
            type: "error",
            title: "No screenshot available",
            description: "The engine did not return a frame to save.",
          });
          return;
        }
        const anchor = document.createElement("a");
        anchor.href = `data:image/png;base64,${result.image}`;
        anchor.download = `flutter-preview-${Date.now()}.png`;
        anchor.click();
        toastManager.add({
          type: "success",
          title: "Screenshot saved",
          description: "Flutter preview screenshot downloaded.",
        });
      })
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Could not save the screenshot",
          description: errorMessage(error, "The engine did not return a frame."),
        });
      });
  }, [props.threadId]);

  const handleRailAction = useCallback(
    (action: DeviceRailAction) => {
      switch (action) {
        case "screenshot":
          savePreviewScreenshot();
          return;
        case "rotate":
          setLandscape((current) => !current);
          return;
        case "home":
        case "record":
        case "shutdown":
        case "detach":
          toastManager.add({
            type: "info",
            title: "Not available in the preview pane",
            description: "Open the iOS Simulator panel to use this device action.",
          });
      }
    },
    [savePreviewScreenshot],
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
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="preview-pane">
      {/* Top Header: Choose Simulator */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <select
          value={frameKind}
          onChange={(event) => handleFrameKindChange(event.target.value as PreviewFrameKind)}
          className="bg-transparent text-sm font-medium text-foreground outline-none appearance-none"
        >
          {FRAME_KIND_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground -ml-1" />
        <div className="min-w-0 flex-1" />
        {isRunning && (
          <div className="flex shrink-0 items-center gap-1 mr-2">
            <button type="button" onClick={() => handleReload(true)} className="p-1.5 text-muted-foreground hover:text-foreground">
              <RefreshCwIcon className="size-3.5" />
            </button>
            <button type="button" onClick={handleStop} className="p-1.5 text-red-500 hover:text-red-400">
              <DeviceRecordStopIcon className="size-3.5" />
            </button>
          </div>
        )}
        <StatusPill state={panelState} />
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black/5 dark:bg-black/20">
        <div className={cn("flex-1 overflow-auto", panelState.activeTab === "preview" ? "block" : "hidden")}>
          {(panelState.status === "idle" || panelState.status === "starting" || panelState.status === "failed") ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <DeviceScreen kind={statusFrameKind} landscape={landscape}>
                <div className="flex h-full w-full flex-col items-center justify-center bg-black p-6 text-center">
                  {panelState.status === "starting" ? (
                    <>
                      <LoaderIcon className="size-5 animate-spin text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Starting simulator...</p>
                    </>
                  ) : panelState.status === "failed" ? (
                    <>
                      <p className="text-sm text-red-500 mb-3">{panelState.error ?? "Failed to start"}</p>
                      <button onClick={handleStart} className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-medium">Retry</button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Choose a frame to<br/>preview the Flutter app here.
                    </p>
                  )}
                </div>
              </DeviceScreen>
            </div>
          ) : (
            isRunning && panelState.url !== null && (
              <PreviewDeviceFrame
                threadId={props.threadId}
                frameKind={frameKind}
                url={panelState.url}
                reloadToken={panelState.reloadToken}
                landscape={landscape}
                onRotate={() => setLandscape((current) => !current)}
                onScreenshot={savePreviewScreenshot}
                onRailAction={handleRailAction}
              />
            )
          )}
        </div>
        
        {panelState.activeTab === "problems" && <div className="flex-1 overflow-hidden"><ProblemList state={panelState.analyze} /></div>}
        {panelState.activeTab === "tests" && <div className="flex-1 overflow-hidden"><TestResults state={panelState.test} /></div>}
        {panelState.activeTab === "qualityGate" && (
          <div className="flex-1 overflow-hidden">
            <QualityGatePanel
              analyze={panelState.analyze}
              test={panelState.test}
              onRunAnalyze={handleRunAnalyze}
              onRunTest={handleRunTest}
            />
          </div>
        )}
        {panelState.activeTab === "release" && (
          <div className="flex-1 overflow-hidden">
            <ReleasePanel build={panelState.build} onBuild={handleBuild} />
          </div>
        )}
      </div>

      {/* Bottom Nav Bar for Tabs */}
      <div
        className="flex shrink-0 items-center justify-center gap-6 border-t border-border px-4 py-3 bg-background"
        role="tablist"
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
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <TabIcon aria-hidden="true" className="size-4" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PreviewPanel;
