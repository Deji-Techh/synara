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
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureNativeApi } from "~/nativeApi";
import type { PreviewDeviceId, RightDockPane } from "~/rightDockStore.logic";
import {
  ArchiveIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
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
import { buildLocalImageUrl } from "~/lib/localImageUrls";
import { PanelStateMessage } from "./PanelStateMessage";
import { toastManager } from "../ui/toast";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
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

const PREVIEW_POLL_INTERVAL_MS = 2_000;
const NATIVE_FRAME_POLL_INTERVAL_MS = 1_500;
const BUILD_POLL_INTERVAL_MS = 2_000;
const TOOLCHAIN_POLL_INTERVAL_MS = 10_000;
const LOGS_RENDER_LIMIT = 80;

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

const FRAME_KIND_TO_FLUTTER_DEVICE: Record<
  PreviewFrameKind,
  "web-server" | "emulator" | "simulator"
> = {
  androidPhone: "emulator",
  iPhone: "simulator",
  iPad: "simulator",
  frameless: "web-server",
};

const DEVICE_ID_FRAME_KIND_FALLBACK: Record<PreviewDeviceId, PreviewFrameKind> = {
  mobile: "androidPhone",
  tablet: "iPad",
  desktop: "frameless",
};

const FRAME_KIND_OPTIONS: readonly { id: PreviewFrameKind; label: string }[] = [
  { id: "androidPhone", label: "Android Phone" },
  { id: "iPad", label: "iPad" },
  { id: "iPhone", label: "iPhone" },
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

interface PreviewDeviceInfo {
  id: string;
  name: string;
  isEmulator: boolean;
  platform?: "android" | "ios" | "web";
}

/**
 * Pick a concrete deviceId for a native run from the engine's device list
 * (AVDs / adb / simctl). Falls back to the generic device name when nothing
 * matches or the list is unavailable — the engine already handles both.
 */
function pickNativeDeviceId(
  devices: PreviewDeviceInfo[] | null,
  flutterDevice: "web-server" | "emulator" | "simulator",
): string | undefined {
  if (devices === null || flutterDevice === "web-server") {
    return undefined;
  }
  const wanted = flutterDevice === "emulator" ? "android" : "ios";
  return devices.find((device) => device.platform === wanted)?.id;
}

function hasNativeDeviceFor(
  devices: PreviewDeviceInfo[] | null,
  flutterDevice: "web-server" | "emulator" | "simulator",
): boolean | null {
  if (devices === null || flutterDevice === "web-server") return null;
  const wanted = flutterDevice === "emulator" ? "android" : "ios";
  return devices.some((device) => device.platform === wanted);
}

function isDeviceNotFoundError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no supported devices") ||
    (lower.includes("emulator") && lower.includes("linux")) ||
    (lower.includes("simulator") && lower.includes("macos")) ||
    (lower.includes("not found") &&
      (lower.includes("device") || lower.includes("emulator") || lower.includes("simulator"))) ||
    (lower.includes("could not find") &&
      (lower.includes("device") || lower.includes("emulator") || lower.includes("simulator")))
  );
}

function FlutterToolchainBanner(props: { threadId: ThreadId; isVisible: boolean }) {
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
  const installingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    ensureNativeApi()
      .preview.flutterToolchainStatus({ threadId: props.threadId })
      .then((res) => {
        const r = res as {
          supported: boolean;
          installed: boolean;
          version: string;
          estimatedDownloadBytes: number;
          unsupportedReason: string | null;
          installProgress?: {
            phase: string;
            percent: number;
            componentPercent: number;
            downloadedBytes: number;
            totalBytes: number | null;
            message: string;
          } | null;
        };
        setStatus(r);
        // The engine reports real managed-SDK install progress through the
        // status payload; drive the bar from it instead of the pinned seed.
        if (installingRef.current && r.installProgress) {
          setProgress(r.installProgress);
        }
      })
      .catch(() => {});
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) return;
    refresh();
    // Pauses while hidden — keep-mounted hidden preview panes were spamming
    // the WS with toolchain polls and keeping the engine awake, causing the
    // CPU/RAM spike on every preview switch.
    const id = window.setInterval(refresh, TOOLCHAIN_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [props.isVisible, refresh]);

  // Poll progress via status while installing (engine emits progress via logs, but status percent drives bar)
  useEffect(() => {
    if (!installing || !props.isVisible) return;
    const iv = window.setInterval(() => {
      // While installing, re-use status polling for fallback + try to read engine logs for progress percent
      refresh();
    }, 1000);
    return () => window.clearInterval(iv);
  }, [installing, props.isVisible, refresh]);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    installingRef.current = true;
    setError(null);
    setProgress({
      phase: "preparing",
      percent: 1,
      componentPercent: 0,
      downloadedBytes: 0,
      totalBytes: status?.estimatedDownloadBytes ?? null,
      message: "Preparing Flutter SDK…",
    });
    ensureNativeApi()
      .preview.flutterToolchainInstall({ threadId: props.threadId })
      .then(() => {
        setInstalling(false);
        installingRef.current = false;
        setProgress({
          phase: "done",
          percent: 100,
          componentPercent: 100,
          downloadedBytes: status?.estimatedDownloadBytes ?? 0,
          totalBytes: status?.estimatedDownloadBytes ?? null,
          message: "Flutter SDK ready.",
        });
        toastManager.add({
          type: "success",
          title: "Flutter SDK installed",
          description: "Flutter is ready to build and preview.",
        });
        refresh();
        window.setTimeout(() => setProgress(null), 3000);
      })
      .catch((e: unknown) => {
        setInstalling(false);
        installingRef.current = false;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastManager.add({
          type: "error",
          title: "Flutter install failed",
          description: msg.slice(0, 300),
        });
      });
  }, [props.threadId, status?.estimatedDownloadBytes, refresh]);

  if (!status) return null;
  if (status.installed && !installing && !progress) return null;
  if (!status.supported) {
    return (
      <div className="mx-3 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Flutter auto-install is not available on this platform. Please install Flutter manually.
        {status.unsupportedReason && (
          <span className="block text-amber-600/80">{status.unsupportedReason}</span>
        )}
      </div>
    );
  }

  const pct = progress ? Math.round(progress.percent) : 0;
  const downloaded = progress
    ? `${(progress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB${progress.totalBytes ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB` : ""}`
    : null;

  return (
    <div className="mx-3 mt-3 rounded-md border border-border bg-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <LoaderIcon
          aria-hidden="true"
          className={cn("size-3.5 text-muted-foreground", installing && "animate-spin")}
        />
        <span className="text-xs font-medium">
          {installing
            ? (progress?.message ?? "Installing Flutter SDK…")
            : !status.installed
              ? `Flutter ${status.version} not installed`
              : "Flutter SDK"}
        </span>
        <span className="min-w-0 flex-1" />
        {!status.installed && !installing && (
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            Download {status.version}
          </button>
        )}
        {installing && <span className="text-xs text-muted-foreground">{pct}%</span>}
      </div>
      {(installing || progress) && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate">{progress?.message ?? ""}</span>
            {downloaded && <span className="ml-2 shrink-0">{downloaded}</span>}
          </div>
        </div>
      )}
      {error && <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!installing && !status.installed && status.estimatedDownloadBytes > 0 && !progress && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          ~{(status.estimatedDownloadBytes / (1024 * 1024)).toFixed(0)} MB download. Progress shows
          above during install.
        </p>
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
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400"
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

function PreviewConsoleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: readonly string[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { logs, open } = props;
  useEffect(() => {
    if (!open || listRef.current === null) {
      return;
    }
    // Next frame so Dialog popup has measured height before scrolling.
    const id = window.requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [logs, open]);

  const visibleLogs = logs.length > LOGS_RENDER_LIMIT ? logs.slice(-LOGS_RENDER_LIMIT) : logs;
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    const text = logs.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [logs]);

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-2xl" showCloseButton>
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TerminalIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            Console — flutter run
          </DialogTitle>
          <DialogDescription className="text-xs">
            Live `flutter run` output. {logs.length > 0 ? `${logs.length} lines` : "No output yet."}
            {logs.length > LOGS_RENDER_LIMIT && ` — showing last ${LOGS_RENDER_LIMIT}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-2 px-4 pb-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={logs.length === 0}
              className="h-7 text-xs"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
              }}
              className="h-7 text-xs"
            >
              Jump to bottom
            </Button>
          </div>
          <div
            ref={listRef}
            className="max-h-[50vh] min-h-[220px] overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {logs.length === 0 ? (
              <p>Waiting for `flutter run` output…</p>
            ) : (
              <>
                {logs.length > LOGS_RENDER_LIMIT && (
                  <p className="mb-1 text-[10px] text-muted-foreground/60">
                    Showing last {LOGS_RENDER_LIMIT} of {logs.length} lines…
                  </p>
                )}
                {visibleLogs.map((line, index) => (
                  <p key={index} className="break-words whitespace-pre-wrap">
                    {line}
                  </p>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
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

/** Basename of a build artifact path, for the download button label. */
function artifactDownloadLabel(outputPath: string): string {
  const slash = Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"));
  return slash >= 0 ? outputPath.slice(slash + 1) : outputPath;
}

function ReleasePanel(props: {
  build: PreviewBuildState;
  onBuild: (options: {
    target: "apk" | "appbundle" | "ipa";
    channel: "debug" | "profile" | "release";
    signing?: {
      keystorePath: string;
      keyAlias: string;
      storePassword: string;
      keyPassword: string;
    } | null;
  }) => void;
  /** Thread workspace root; artifact downloads resolve against it. */
  workspaceRoot: string | null;
}) {
  const [target, setTarget] = useState(props.build.target);
  const [channel, setChannel] = useState(props.build.channel);
  const [showSigning, setShowSigning] = useState(false);
  const [keystorePath, setKeystorePath] = useState("");
  const [keyAlias, setKeyAlias] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [keyPassword, setKeyPassword] = useState("");
  const isRunning = props.build.running;
  const needsSigning = (target === "apk" || target === "appbundle") && channel === "release";
  const canBuild =
    !isRunning &&
    (!needsSigning ||
      !showSigning ||
      (keystorePath.trim() && keyAlias.trim() && storePassword.trim() && keyPassword.trim()));

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
        {target === "ipa" && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            IPA builds require macOS with Xcode installed.
          </p>
        )}
        {needsSigning && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5">
            <button
              type="button"
              onClick={() => setShowSigning((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium"
            >
              <span>Signing (optional for store release)</span>
              <ChevronDownIcon
                aria-hidden="true"
                className={cn("size-3.5 transition-transform", showSigning && "rotate-180")}
              />
            </button>
            {showSigning && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  Keystore path
                  <input
                    value={keystorePath}
                    onChange={(e) => setKeystorePath(e.target.value)}
                    placeholder="/path/to/release.jks"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  Key alias
                  <input
                    value={keyAlias}
                    onChange={(e) => setKeyAlias(e.target.value)}
                    placeholder="upload"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Store password
                    <input
                      type="password"
                      value={storePassword}
                      onChange={(e) => setStorePassword(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Key password
                    <input
                      type="password"
                      value={keyPassword}
                      onChange={(e) => setKeyPassword(e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If empty, Flutter uses debug signing. For store builds, provide your upload
                  keystore.
                </p>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            props.onBuild({
              target,
              channel,
              signing:
                showSigning && keystorePath.trim()
                  ? {
                      keystorePath: keystorePath.trim(),
                      keyAlias: keyAlias.trim(),
                      storePassword,
                      keyPassword,
                    }
                  : null,
            })
          }
          disabled={!canBuild}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-foreground text-background hover:opacity-90",
            !canBuild && "cursor-not-allowed opacity-60",
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
        <div className="flex flex-col gap-1 rounded-md bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="inline-flex items-center gap-2">
            <CheckIcon aria-hidden="true" className="size-4" />
            Build succeeded
          </span>
          {props.build.outputPath !== null && (
            <span className="break-all text-muted-foreground"> {props.build.outputPath}</span>
          )}
          {(props.build as unknown as { sha256?: string | null }).sha256 && (
            <span className="break-all font-mono text-[11px] text-muted-foreground">
              sha256: {(props.build as unknown as { sha256: string }).sha256}
            </span>
          )}
          {props.build.outputPath !== null && props.workspaceRoot !== null && (
            <a
              href={buildLocalImageUrl({
                src: props.build.outputPath,
                cwd: props.workspaceRoot,
                download: true,
              })}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <ArchiveIcon aria-hidden="true" className="size-3" />
              Download {artifactDownloadLabel(props.build.outputPath)}
            </a>
          )}
          <span className="text-[11px] font-normal text-emerald-600/80 dark:text-emerald-400/80">
            Saved to Artifacts — open it from the Caide menu.
          </span>
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
  /** The thread's workspace root; scopes artifact downloads to the app workspace. */
  workspaceRoot?: string | null | undefined;
}) {
  const [panelState, setPanelState] = useState<PreviewPanelState>(() =>
    createInitialPreviewPanelState(props.pane.previewDeviceId ?? "mobile"),
  );
  const [isConsoleDialogOpen, setIsConsoleDialogOpen] = useState(false);
  const [landscape, setLandscape] = useState(false);

  // The chassis choice is persisted per thread (survives the pane closing and
  // reopening); when nothing is stored yet it falls back to the pane's device
  // preset so an untouched pane renders the same frame it always did.
  const threadFrameKind = useDeviceStateStore(selectThreadFrameKind(props.threadId));
  const setFrameKind = useDeviceStateStore((store) => store.setFrameKind);
  const frameKind: PreviewFrameKind =
    threadFrameKind ?? DEVICE_ID_FRAME_KIND_FALLBACK[panelState.deviceId];
  // Status states (idle/starting/failed) always draw inside a chassis — there
  // is no frameless "device" to hang a prompt or spinner on — so frameless
  // falls back to the Android phone silhouette rather than showing an empty pane.
  const statusFrameKind: DeviceKind = frameKind === "frameless" ? "androidPhone" : frameKind;

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

  // Real device list from the engine (AVDs, adb, simctl) so native runs can
  // target a concrete device. Listing is best-effort; when it fails the pane
  // falls back to the engine's generic device names.
  const [previewDevices, setPreviewDevices] = useState<PreviewDeviceInfo[] | null>(null);

  useEffect(() => {
    if (!props.isVisible) {
      return;
    }
    let cancelled = false;
    ensureNativeApi()
      .preview.devices({ threadId: props.threadId })
      .then((result) => {
        const list = (result as { devices?: PreviewDeviceInfo[] }).devices;
        if (!cancelled && Array.isArray(list)) {
          setPreviewDevices(list);
        }
      })
      .catch(() => {
        // Keep whatever we had; the generic fallback still works.
      });
    return () => {
      cancelled = true;
    };
  }, [props.isVisible, props.threadId]);

  // Native previews (Android emulator / iOS simulator) cannot render in a
  // browser iframe. While one is running, poll device screenshots and paint
  // the newest frame inside the device chassis; keep the last good frame so a
  // slow or failed capture never blanks the pane.
  const [nativeFrame, setNativeFrame] = useState<{
    image: string;
    capturedAt: number;
  } | null>(null);
  const nativeFrameBusy = useRef(false);

  useEffect(() => {
    if (
      !props.isVisible ||
      panelState.status !== "running" ||
      panelState.kind !== "native" ||
      panelState.url === null
    ) {
      setNativeFrame(null);
      return;
    }
    let cancelled = false;
    const capture = () => {
      if (nativeFrameBusy.current) {
        return;
      }
      nativeFrameBusy.current = true;
      ensureNativeApi()
        .preview.screenshot({ threadId: props.threadId })
        .then((result) => {
          const image = (result as { image?: string | null }).image;
          if (!cancelled && typeof image === "string" && image.length > 0) {
            setNativeFrame({ image, capturedAt: Date.now() });
          }
        })
        .catch(() => {
          // Transient capture failures keep the last good frame on screen.
        })
        .finally(() => {
          nativeFrameBusy.current = false;
        });
    };
    capture();
    const timer = window.setInterval(capture, NATIVE_FRAME_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [props.isVisible, props.threadId, panelState.status, panelState.kind, panelState.url]);

  // Native previews render via screenshots; web previews render in an iframe.
  const isNativePreview =
    panelState.kind === "native" ||
    (panelState.kind === null && panelState.url !== null && panelState.url.startsWith("native:"));

  const nativeScreen =
    isNativePreview && panelState.status === "running" ? (
      nativeFrame !== null ? (
        <img
          key={nativeFrame.capturedAt}
          src={`data:image/png;base64,${nativeFrame.image}`}
          alt="Flutter app running on the device"
          draggable={false}
          className="h-full w-full bg-white object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-center">
          <LoaderIcon className="size-3 animate-spin text-white/60" />
          <p className="text-[11px] text-white/45">Capturing device screen…</p>
        </div>
      )
    ) : null;

  const handleStart = useCallback(() => {
    setPanelState((previous) => previewStartRequested(previous));
    const requestedDevice = FRAME_KIND_TO_FLUTTER_DEVICE[frameKind];
    // If the host has no native device for the requested chassis, fall back
    // to web-server immediately (e.g. Arch Linux with no AVD advertises no
    // android device, so `flutter run -d emulator` would fail with
    // "No supported devices matching 'emulator'. Found: Linux").
    const nativeAvailable = hasNativeDeviceFor(previewDevices, requestedDevice);
    const initialDevice = nativeAvailable === false ? "web-server" : requestedDevice;
    const initialDeviceId =
      initialDevice === "web-server"
        ? undefined
        : pickNativeDeviceId(previewDevices, initialDevice);

    if (initialDevice !== requestedDevice) {
      toastManager.add({
        type: "info",
        title: requestedDevice === "emulator" ? "Emulator unavailable" : "Simulator unavailable",
        description: "Falling back to web preview.",
      });
    }

    const startWith = (
      device: "web-server" | "emulator" | "simulator",
      deviceId: string | undefined,
    ) =>
      ensureNativeApi().preview.start({
        threadId: props.threadId,
        device,
        ...(deviceId !== undefined ? { deviceId } : {}),
      });

    startWith(initialDevice, initialDeviceId)
      .then((result) => {
        setPanelState((previous) => previewStarted(previous, result.url, [], result.kind ?? null));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The preview failed to start.";
        // Auto-retry native → web-server on device-not-found errors. This
        // covers the case where previewDevices was still null (unknown) on
        // first attempt and the engine reports "No supported devices".
        if (initialDevice !== "web-server" && isDeviceNotFoundError(message)) {
          toastManager.add({
            type: "info",
            title: initialDevice === "emulator" ? "Emulator unavailable" : "Simulator unavailable",
            description: "Retrying with web preview…",
          });
          startWith("web-server", undefined)
            .then((result) => {
              setPanelState((previous) =>
                previewStarted(previous, result.url, [], result.kind ?? null),
              );
            })
            .catch((retryError: unknown) => {
              const retryMessage =
                retryError instanceof Error ? retryError.message : "The preview failed to start.";
              setPanelState((previous) => previewStartFailed(previous, retryMessage));
            });
          return;
        }
        setPanelState((previous) => previewStartFailed(previous, message));
      });
  }, [props.threadId, frameKind, previewDevices]);

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
          handleReload(false);
          toastManager.add({
            type: "info",
            title: "Navigated Home",
            description: "Reloaded Flutter preview.",
          });
          return;
        case "shutdown":
        case "detach":
          handleStop();
          return;
        case "record":
          toastManager.add({
            type: "info",
            title: "Recording unavailable",
            description: "Screen recording is not available in web preview.",
          });
      }
    },
    [savePreviewScreenshot, handleReload, handleStop],
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
      signing?: {
        keystorePath: string;
        keyAlias: string;
        storePassword: string;
        keyPassword: string;
      } | null;
    }) => {
      setPanelState((previous) =>
        buildRequested(previous, { target: options.target, channel: options.channel }),
      );
      ensureNativeApi()
        .preview.buildStart({
          threadId: props.threadId,
          target: options.target,
          channel: options.channel,
          ...(options.signing ? { signing: options.signing } : {}),
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

  // A succeeded build means the engine snapshotted it into the global
  // artifacts registry; refresh the gallery cache so the Caide-menu dialog
  // shows it without a manual reopen.
  const queryClient = useQueryClient();
  const buildStatus = panelState.build.status;
  const previousBuildStatusRef = useRef(buildStatus);
  useEffect(() => {
    if (buildStatus === "succeeded" && previousBuildStatusRef.current !== "succeeded") {
      void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
    }
    previousBuildStatusRef.current = buildStatus;
  }, [buildStatus, queryClient]);

  const isRunning = panelState.status === "running";

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#0a0a0a] dark:bg-[#0a0a0a]"
      data-testid="preview-pane"
    >
      {/* Top Header — Synara-style dark chrome, full-width spread */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#111113] px-3">
        <div className="relative flex min-w-0 flex-1 items-center">
          <select
            value={frameKind}
            onChange={(event) => handleFrameKindChange(event.target.value as PreviewFrameKind)}
            className="w-full max-w-[220px] appearance-none rounded-full border border-zinc-700 bg-zinc-800 py-1 pl-2.5 pr-6 text-xs font-medium text-zinc-200 outline-none transition-colors hover:border-zinc-600 hover:bg-zinc-700 focus-visible:ring-1 focus-visible:ring-zinc-600"
          >
            {FRAME_KIND_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute right-[calc(100%-208px)] size-3.5 text-zinc-400 sm:right-1.5"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRunning && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleReload(true)}
                title="Hot reload"
                aria-label="Hot reload"
                className="flex size-7 items-center justify-center rounded-md text-zinc-400 outline-none transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <RefreshCwIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleStop}
                title="Stop preview"
                aria-label="Stop preview"
                className="flex size-7 items-center justify-center rounded-md text-zinc-400 outline-none transition-colors hover:bg-red-950/50 hover:text-red-400 focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <DeviceRecordStopIcon className="size-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsConsoleDialogOpen(true)}
            title="Open console"
            aria-label="Open console"
            className="relative flex size-7 items-center justify-center rounded-md text-zinc-400 outline-none transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-600"
          >
            <TerminalIcon className="size-3.5" />
            {panelState.logs.length > 0 && panelState.status === "failed" && (
              <span
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500"
                aria-hidden="true"
              />
            )}
          </button>
          <StatusPill state={panelState} />
        </div>
      </div>
      <FlutterToolchainBanner threadId={props.threadId} isVisible={props.isVisible} />

      {/* Main Content Area — Synara: full-bleed dark stage, device optically centered */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
        {panelState.activeTab === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {frameKind === "frameless" ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0a0a0a] p-4">
                {panelState.status === "starting" ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
                    <p className="text-[11px] font-medium text-foreground">
                      Starting Flutter preview…
                    </p>
                    <p className="text-[10px] text-muted-foreground">Compiling Flutter bundle</p>
                  </div>
                ) : panelState.status === "failed" ? (
                  (() => {
                    const msg = panelState.error ?? "The preview failed to start.";
                    const isNoWorkspace = msg.toLowerCase().includes("has no workspace");
                    return (
                      <div className="flex flex-col items-center gap-3 px-[12%] py-6 text-center">
                        <p
                          className={cn(
                            "max-w-[260px] break-words text-center text-[11px] leading-snug",
                            isNoWorkspace ? "text-zinc-400" : "text-destructive",
                          )}
                        >
                          {isNoWorkspace ? "Choose a simulator or start previewing here." : msg}
                        </p>
                        <button
                          type="button"
                          onClick={handleStart}
                          className="rounded-full bg-foreground px-4 py-1.5 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
                        >
                          Retry
                        </button>
                      </div>
                    );
                  })()
                ) : isRunning && panelState.url !== null ? (
                  isNativePreview ? (
                    nativeScreen
                  ) : (
                    <iframe
                      key={panelState.reloadToken}
                      src={panelState.url}
                      title="Flutter preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                      className="h-full w-full border-0 bg-white"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-3 px-[12%] py-6 text-center">
                    <p className="text-balance text-[11px] leading-snug text-zinc-400">
                      Preview is idle. Choose a device above and start the preview.
                    </p>
                    <button
                      type="button"
                      onClick={handleStart}
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
                    >
                      <PlayIcon className="size-3" />
                      Start preview
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden bg-[#0a0a0a]">

                <DeviceScreen
                  className="min-h-0 w-full flex-1 overflow-hidden"
                  kind={statusFrameKind}
                  pixelWidth={statusFrameKind === "androidPhone" ? 1206 : undefined}
                  pixelHeight={statusFrameKind === "androidPhone" ? 2622 : undefined}
                  landscape={landscape}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center bg-black text-center">
                    {panelState.status === "starting" ? (
                      <div className="flex flex-col items-center gap-3 px-[12%] text-center">
                        <p className="text-[11px] font-medium text-white/90">
                          Starting Flutter preview…
                        </p>
                        <span className="flex items-center gap-1.5 text-[10px] text-white/45">
                          <LoaderIcon className="size-3 animate-spin" />
                          Compiling Flutter bundle
                        </span>
                      </div>
                    ) : panelState.status === "failed" ? (
                      (() => {
                        const msg = panelState.error ?? "Failed to start";
                        const isNoWorkspace = msg.toLowerCase().includes("has no workspace");
                        return (
                          <div className="flex flex-col items-center gap-3 px-[12%] text-center">
                            <p
                              className={cn(
                                "max-w-[240px] break-words text-[11px] leading-snug",
                                isNoWorkspace ? "text-zinc-300" : "text-red-400",
                              )}
                            >
                              {isNoWorkspace ? "Choose a simulator or start previewing here." : msg}
                            </p>
                            <button
                              type="button"
                              onClick={handleStart}
                              className="rounded-full bg-white px-4 py-1.5 text-[11px] font-medium text-black transition-opacity hover:opacity-90"
                            >
                              Retry
                            </button>
                          </div>
                        );
                      })()
                    ) : isRunning && panelState.url !== null ? (
                      isNativePreview ? (
                        nativeScreen
                      ) : (
                        <iframe
                          key={panelState.reloadToken}
                          src={panelState.url}
                          title="Flutter preview"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                          className="h-full w-full border-0 bg-white"
                        />
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 px-[12%] text-center">
                        <p className="text-balance text-[11px] leading-snug text-white/45">
                          Choose a simulator or start previewing here.
                        </p>
                        <button
                          type="button"
                          onClick={handleStart}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[11px] font-medium text-black transition-opacity hover:opacity-90"
                        >
                          <PlayIcon className="size-3 fill-black" />
                          Start Preview
                        </button>
                      </div>
                    )}
                  </div>
                </DeviceScreen>
                <div className="relative z-10 flex w-full shrink-0 justify-center">
                  <DeviceControlRail
                    disabled={!isRunning}
                    recording={false}
                    landscape={landscape}
                    spread
                    onAction={handleRailAction}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {panelState.activeTab === "problems" && (
          <div className="flex-1 overflow-hidden">
            <ProblemList state={panelState.analyze} />
          </div>
        )}
        {panelState.activeTab === "tests" && (
          <div className="flex-1 overflow-hidden">
            <TestResults state={panelState.test} />
          </div>
        )}
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
            <ReleasePanel
              build={panelState.build}
              onBuild={handleBuild}
              workspaceRoot={props.workspaceRoot ?? null}
            />
          </div>
        )}
      </div>

      {/* Bottom Tab Bar — Synara dark */}
      <div
        className="grid w-full shrink-0 grid-cols-5 gap-1 border-t border-zinc-800 bg-[#111113] px-2 py-1.5"
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
                "flex w-full flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
                isSelected
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300",
              )}
            >
              <TabIcon aria-hidden="true" className="size-3.5" />
              <span className="leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <PreviewConsoleDialog
        open={isConsoleDialogOpen}
        onOpenChange={setIsConsoleDialogOpen}
        logs={panelState.logs}
      />
    </div>
  );
}

export default PreviewPanel;
