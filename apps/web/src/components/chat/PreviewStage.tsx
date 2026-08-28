// FILE: PreviewStage.tsx
// Purpose: Floating fixed-size Android preview stage — themed, animated, branch-popover header.
// Layer: Chat surface — sits beside transcript, shifts it left without opening RightDock.
// Depends on: DeviceFrame (androidPhone), previewStageStore, wsNativeApi.preview, previewPanel.logic.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectFramework, ThreadId } from "@caide/contracts";

import { ensureNativeApi } from "~/nativeApi";
import { DeviceScreen } from "../device/DeviceFrame";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import {
  ArchiveIcon,
  BugIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  FlaskConicalIcon,
  ListChecksIcon,
  LoaderIcon,
  PlayIcon,
  RefreshCwIcon,
  TerminalIcon,
  DeviceHomeIcon,
  DeviceShutterIcon,
  DeviceRecordIcon,
  DeviceRotateIcon,
  DevicePowerIcon,
  DeviceRecordStopIcon,
} from "~/lib/icons";
import {
  createInitialPreviewPanelState,
  mergeBuildState,
  mergeEnginePreviewState,
  previewStartRequested,
  previewStarted,
  previewStartFailed,
  previewReloadRequested,
  analyzeRequested,
  analyzeFinished,
  analyzeFailed,
  testRequested,
  testFinished,
  testFailed,
  buildRequested,
  buildAccepted,
  buildFailed,
  type PreviewPanelState,
  type PreviewAnalyzeState,
  type PreviewBuildState,
  type PreviewTestState,
} from "./previewPanel.logic";
import { buildLocalImageUrl } from "~/lib/localImageUrls";
import { PanelStateMessage } from "./PanelStateMessage";
import { CHAT_BACKGROUND_CLASS_NAME } from "./composerPickerStyles";

export const PREVIEW_STAGE_FIXED_WIDTH_PX = 42 * 16; // 672px

type HeaderMode = "quality" | "controls";
type BranchId =
  | "qualityGate"
  | "release"
  | "terminal"
  | "screenshot"
  | null;

const PREVIEW_POLL_INTERVAL_MS = 2_000;
const NATIVE_FRAME_POLL_INTERVAL_MS = 1_500;
const BUILD_POLL_INTERVAL_MS = 2_000;
const TOOLCHAIN_POLL_INTERVAL_MS = 10_000;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * Flutter's first `flutter run` can take 3-5 min (pub get + compilation).
 * The engine may surface a transient "exited (code 0) before serving" with
 * logs like "Launching lib/main.dart..." while the Dart compiler is still
 * running. Showing a hard "Failed" screen for that window is a bad UX –
 * the preview *will* appear after the build finishes (poll will recover to
 * running). Treat that shape as "still starting" and keep the skeleton.
 */
function isTransientStartingError(state: PreviewPanelState): boolean {
  if (state.status !== "failed" || !state.error) return false;
  const msg = state.error.toLowerCase();
  const transientPhrase =
    msg.includes("before serving") ||
    msg.includes("did not start serving") ||
    msg.includes("exited (code 0)") ||
    msg.includes("waiting for connection");
  if (!transientPhrase) return false;
  const logText = state.logs.join("\n").toLowerCase();
  return (
    logText.includes("launching lib/main.dart") ||
    logText.includes("waiting for connection") ||
    logText.includes("resolving dependencies") ||
    logText.includes("downloading packages") ||
    logText.includes("compiling")
  );
}

// Status pill — themed, mirrors PreviewPanel StatusPill
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
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
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
        if (installingRef.current && r.installProgress) setProgress(r.installProgress);
      })
      .catch(() => {});
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) return;
    refresh();
    const id = window.setInterval(refresh, TOOLCHAIN_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [props.isVisible, refresh]);

  useEffect(() => {
    if (!installing || !props.isVisible) return;
    const iv = window.setInterval(() => refresh(), 1000);
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
        Flutter auto-install is not available on this platform.
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
    </div>
  );
}

function PreviewConsoleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: readonly string[];
  framework?: ProjectFramework;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { logs, open } = props;
  useEffect(() => {
    if (!open || listRef.current === null) return;
    const id = window.requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [logs, open]);
  const visibleLogs = logs.length > 80 ? logs.slice(-80) : logs;
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
            Console — {props.framework === "website" ? "dev server" : props.framework === "react-native" ? "Expo" : "flutter run"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Live {props.framework === "website" ? "`npm run dev`" : props.framework === "react-native" ? "Expo" : "`flutter run`"} output.{" "}
            {logs.length > 0 ? `${logs.length} lines` : "No output yet."}
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
          </div>
          <div
            ref={listRef}
            className="max-h-[50vh] min-h-[220px] overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {logs.length === 0 ? (
              <p>Waiting for `flutter run` output…</p>
            ) : (
              visibleLogs.map((line, i) => (
                <p key={i} className="break-words whitespace-pre-wrap">
                  {line}
                </p>
              ))
            )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function ProblemList({ state }: { state: PreviewAnalyzeState }) {
  if (state.running && state.issues.length === 0)
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
          Running flutter analyze…
        </span>
      </PanelStateMessage>
    );
  if (state.error !== null)
    return (
      <PanelStateMessage density="compact" fill="flex">
        <span className="text-red-600 dark:text-red-400">{state.error}</span>
      </PanelStateMessage>
    );
  if (!state.clean && state.issues.length === 0)
    return <PanelStateMessage density="compact">No analyze results yet.</PanelStateMessage>;
  if (state.issues.length === 0)
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <CheckIcon aria-hidden="true" className="size-4 text-emerald-500" />
          No issues found.
        </span>
      </PanelStateMessage>
    );
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
  if (state.running && state.output.length === 0)
    return (
      <PanelStateMessage density="compact">
        <span className="inline-flex items-center gap-2">
          <LoaderIcon aria-hidden="true" className="size-4 animate-spin" />
          Running flutter test…
        </span>
      </PanelStateMessage>
    );
  if (state.error !== null)
    return (
      <PanelStateMessage density="compact" fill="flex">
        <span className="text-red-600 dark:text-red-400">{state.error}</span>
      </PanelStateMessage>
    );
  if (state.output.length === 0)
    return <PanelStateMessage density="compact">No test results yet.</PanelStateMessage>;
  const total = state.passed + state.failed + state.skipped;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          {state.passed} passed
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            state.failed > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {state.failed} failed
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
        {state.output.split("\n").map((line, i) => (
          <p key={i} className="break-words whitespace-pre-wrap">
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

function artifactDownloadLabel(outputPath: string): string {
  const slash = Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"));
  return slash >= 0 ? outputPath.slice(slash + 1) : outputPath;
}

function ReleasePanel(props: {
  build: PreviewBuildState;
  onBuild: (options: {
    target: "apk" | "appbundle" | "ipa" | "web";
    channel: "debug" | "profile" | "release";
    signing?: {
      keystorePath: string;
      keyAlias: string;
      storePassword: string;
      keyPassword: string;
    } | null;
  }) => void;
  workspaceRoot: string | null;
  framework?: ProjectFramework;
}) {
  const [target, setTarget] = useState(props.build.target);
  const [channel, setChannel] = useState(props.build.channel);
  const [showSigning, setShowSigning] = useState(false);
  const [keystorePath, setKeystorePath] = useState("");
  const [keyAlias, setKeyAlias] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [keyPassword, setKeyPassword] = useState("");
  const isRunning = props.build.running;
  useEffect(() => {
    if (props.framework === "website") setTarget("web");
    if (props.framework === "react-native" || props.framework === "flutter") {
      setTarget((current) => (current === "web" ? "apk" : current));
    }
  }, [props.framework]);
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
              onChange={(e) => setTarget(e.target.value as "apk" | "appbundle" | "ipa" | "web")}
              disabled={isRunning || props.framework === "website"}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {props.framework === "website" ? (
                <option value="web">Website bundle</option>
              ) : (
                <>
                  <option value="apk">APK (Android)</option>
                  <option value="appbundle">AAB (Play Store)</option>
                  <option value="ipa">IPA (iOS)</option>
                </>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "debug" | "profile" | "release")}
              disabled={isRunning}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="debug">Debug</option>
              <option value="profile">Profile</option>
              <option value="release">Release</option>
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
              <LoaderIcon aria-hidden="true" className="size-3.5 animate-spin" /> Building…
            </>
          ) : (
            <>
              <ArchiveIcon aria-hidden="true" className="size-3.5" /> Build {target.toUpperCase()}
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
            <CheckIcon aria-hidden="true" className="size-4" /> Build succeeded
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
              <ArchiveIcon aria-hidden="true" className="size-3" /> Download{" "}
              {artifactDownloadLabel(props.build.outputPath)}
            </a>
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
          {props.build.logs.map((line, i) => (
            <p key={i} className="break-words whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Branch popup — floating card that looks like a branch from the header
function BranchPopup(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  onToggleMode?: () => void;
  toggleIcon?: "down" | "up";
  children: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="absolute right-3 top-full z-20 mt-2 flex max-h-[60vh] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in slide-in-from-top-2 duration-220">
      {/* branch stem */}
      <div className="absolute -top-2 right-8 h-2 w-px bg-border" aria-hidden="true" />
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">{props.title}</span>
        <div className="flex items-center gap-1">
          {props.onToggleMode && (
            <button
              type="button"
              onClick={props.onToggleMode}
              className="flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              title={props.toggleIcon === "down" ? "Show controls" : "Show quality"}
            >
              {props.toggleIcon === "down" ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronUpIcon className="size-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={props.onClose}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-popover">{props.children}</div>
    </div>
  );
}

export function PreviewStage(props: {
  threadId: ThreadId;
  isVisible: boolean;
  workspaceRoot?: string | null;
  framework?: ProjectFramework;
}) {
  const [panelState, setPanelState] = useState<PreviewPanelState>(() =>
    createInitialPreviewPanelState("mobile"),
  );
  const [isConsoleDialogOpen, setIsConsoleDialogOpen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [headerMode, setHeaderMode] = useState<HeaderMode>("quality");
  const [branch, setBranch] = useState<BranchId>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const browserPreviewRef = useRef<HTMLDivElement | null>(null);
  const [browserDims, setBrowserDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = browserPreviewRef.current;
    if (!el) return;
    const measure = () => setBrowserDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const framework = props.framework ?? "blank";
  const isWebsite = framework === "website";
  const isFlutter = framework === "flutter";
  const isReactNative = framework === "react-native";
  // Only Website uses the browser chrome (traffic lights + full iframe). React Native
  // now renders inside the same device frame as Flutter – the user explicitly
  // requested RN = Flutter device UI, website = browser surface.
  const isBrowserProject = isWebsite;
  const isDeviceFrameProject = isFlutter || isReactNative;
  const frameworkLabel =
    framework === "react-native"
      ? "React Native app"
      : framework === "flutter"
        ? "Flutter app"
        : framework === "website"
          ? "website"
          : "app";
  const isBuildableProject =
    framework === "website" || framework === "react-native" || framework === "flutter";

  useEffect(() => {
    if (isBrowserProject) setHeaderMode("controls");
  }, [isBrowserProject]);

  const openBranch = useCallback((id: BranchId) => {
    setBranch(id);
    setBranchOpen(true);
  }, []);
  const closeBranch = useCallback(() => setBranchOpen(false), []);

  // keep headerMode in sync with branch content: switching mode closes branch
  const handleToggleHeaderMode = useCallback(() => {
    setHeaderMode((m) => (m === "quality" ? "controls" : "quality"));
    setBranchOpen(false);
    setBranch(null);
  }, []);

  const pollOnce = useCallback(() => {
    ensureNativeApi()
      .preview.getState({ threadId: props.threadId })
      .then((snapshot) => {
        const snapKind = (snapshot as unknown as { kind?: "web" | "native" }).kind;
        setPanelState((prev) =>
          mergeEnginePreviewState(prev, {
            running: snapshot.running,
            url: snapshot.url,
            logs: snapshot.logs,
            ...(snapKind ? { kind: snapKind } : {}),
          }),
        );
      })
      .catch(() => {});
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) return;
    pollOnce();
    const timer = window.setInterval(pollOnce, PREVIEW_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [props.isVisible, pollOnce]);

  const [nativeFrame, setNativeFrame] = useState<{ image: string; capturedAt: number } | null>(
    null,
  );
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
      if (nativeFrameBusy.current) return;
      nativeFrameBusy.current = true;
      ensureNativeApi()
        .preview.screenshot({ threadId: props.threadId })
        .then((result) => {
          const image = (result as { image?: string | null }).image;
          if (!cancelled && typeof image === "string" && image.length > 0) {
            setNativeFrame({ image, capturedAt: Date.now() });
            // M11 visual verification: push artifact_updated to Verifier fresh ctx via caideRunner WS
            // Web will forward this screenshot base64 as {type: "artifact_updated", path: "preview:screenshot"} + verifier check
            // Pure Caide: no dyad, just caideRunner.verifySlice with fresh ctx
            void image;
          }
        })
        .catch(() => {})
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

  const isNativePreview =
    panelState.kind === "native" ||
    (panelState.kind === null && panelState.url !== null && panelState.url.startsWith("native:"));
  const isRunning = panelState.status === "running";

  const nativeScreen =
    isNativePreview && isRunning ? (
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
    setPanelState((prev) => previewStartRequested(prev));
    // The engine is the source of truth for whether a project can be previewed —
    // it knows the app's actual framework (blank/RN/flutter/website) from the
    // engine DB. A web-side framework gate was dropping valid RN/website apps
    // (and stale "blank" values persisted across projects); let preview/start
    // succeed or fail with an accurate engine error instead.
    ensureNativeApi()
      .preview.start({ threadId: props.threadId, device: "web-server" })
      .then((result) =>
        setPanelState((prev) => previewStarted(prev, result.url, [], result.kind ?? null)),
      )
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "The preview failed to start.";
        setPanelState((prev) => previewStartFailed(prev, msg));
      });
  }, [props.threadId]);

  const handleStop = useCallback(() => {
    void ensureNativeApi().preview.stop({ threadId: props.threadId });
  }, [props.threadId]);

  const handleReload = useCallback(
    (hotReload: boolean) => {
      setPanelState((prev) => previewReloadRequested(prev));
      void ensureNativeApi().preview.reload({ threadId: props.threadId, hotReload });
    },
    [props.threadId],
  );

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
        anchor.download = `${framework === "flutter" ? "flutter" : "preview"}-${Date.now()}.png`;
        anchor.click();
        toastManager.add({
          type: "success",
          title: "Screenshot saved",
          description: "Preview screenshot downloaded.",
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

  const handleRunAnalyze = useCallback(() => {
    setPanelState((prev) => analyzeRequested(prev));
    ensureNativeApi()
      .preview.analyze({ threadId: props.threadId })
      .then((result) =>
        setPanelState((prev) =>
          analyzeFinished(prev, {
            issues: result.issues,
            clean: result.clean,
            output: result.output,
          }),
        ),
      )
      .catch((e: unknown) =>
        setPanelState((prev) =>
          analyzeFailed(prev, e instanceof Error ? e.message : "analyze failed."),
        ),
      );
  }, [props.threadId]);

  const handleRunTest = useCallback(() => {
    setPanelState((prev) => testRequested(prev));
    ensureNativeApi()
      .preview.test({ threadId: props.threadId })
      .then((result) =>
        setPanelState((prev) =>
          testFinished(prev, {
            passed: result.passed,
            failed: result.failed,
            skipped: result.skipped,
            output: result.output,
          }),
        ),
      )
      .catch((e: unknown) =>
        setPanelState((prev) =>
          testFailed(prev, e instanceof Error ? e.message : "flutter test failed."),
        ),
      );
  }, [props.threadId]);

  const handleBuild = useCallback(
    (options: {
      target: "apk" | "appbundle" | "ipa" | "web";
      channel: "debug" | "profile" | "release";
      signing?: {
        keystorePath: string;
        keyAlias: string;
        storePassword: string;
        keyPassword: string;
      } | null;
    }) => {
      setPanelState((prev) =>
        buildRequested(prev, { target: options.target, channel: options.channel }),
      );
      ensureNativeApi()
        .preview.buildStart({
          threadId: props.threadId,
          target: options.target,
          channel: options.channel,
          ...(options.signing ? { signing: options.signing } : {}),
        })
        .then((result) => setPanelState((prev) => buildAccepted(prev, result.buildId)))
        .catch((e: unknown) =>
          setPanelState((prev) =>
            buildFailed(prev, e instanceof Error ? e.message : "Build failed to start."),
          ),
        );
    },
    [props.threadId],
  );

  const pollBuildOnce = useCallback(() => {
    setPanelState((prev) => {
      if (!prev.build.running || prev.build.buildId === null) return prev;
      void ensureNativeApi()
        .preview.buildState({ threadId: props.threadId, buildId: prev.build.buildId })
        .then((snapshot) => setPanelState((cur) => mergeBuildState(cur, snapshot)))
        .catch(() => {});
      return prev;
    });
  }, [props.threadId]);

  useEffect(() => {
    if (!props.isVisible) return;
    pollBuildOnce();
    const timer = window.setInterval(pollBuildOnce, BUILD_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [props.isVisible, pollBuildOnce]);

  // Branch content — 2+2 → 3+console: tests+problems folded into qualityGate
  const branchContent = (() => {
    if (!branch) return null;
    switch (branch) {
      case "qualityGate":
        return (
          <QualityGatePanel
            analyze={panelState.analyze}
            test={panelState.test}
            onRunAnalyze={handleRunAnalyze}
            onRunTest={handleRunTest}
          />
        );
      case "release":
        return (
          <ReleasePanel
            build={panelState.build}
            onBuild={handleBuild}
            workspaceRoot={props.workspaceRoot ?? null}
            framework={framework}
          />
        );
      case "terminal":
        return (
          <div className="flex h-full min-h-[240px] flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium">
                Console — {framework === "website" ? "dev server" : framework === "react-native" ? "Expo" : "flutter run"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsConsoleDialogOpen(true)}
              >
                Open full console
              </Button>
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {panelState.logs.length === 0 ? (
                <p>
                  Waiting for {framework === "website" ? "`npm run dev`" : framework === "react-native" ? "Expo" : "`flutter run`"} output…
                </p>
              ) : (
                panelState.logs.slice(-80).map((l, i) => (
                  <p key={i} className="break-words whitespace-pre-wrap">
                    {l}
                  </p>
                ))
              )}
            </div>
          </div>
        );
      case "screenshot":
        return (
          <div className="p-4">
            <p className="text-xs text-muted-foreground">
              Capture the current preview frame as a PNG.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={savePreviewScreenshot}
              disabled={!isRunning}
            >
              Save screenshot
            </Button>
          </div>
        );
      default:
        return null;
    }
  })();

  const branchTitle =
    branch === "qualityGate"
      ? "Quality Gate"
      : branch === "release"
        ? "Release"
        : branch === "terminal"
          ? "Console"
          : branch === "screenshot"
            ? "Screenshot"
            : "";

  if (!props.isVisible) return null;

  return (
    <div
      className={cn(
        "flex h-full w-full shrink-0 flex-col overflow-visible border-l border-border",
        CHAT_BACKGROUND_CLASS_NAME,
      )}
      data-testid="preview-stage"
      style={{ width: `${PREVIEW_STAGE_FIXED_WIDTH_PX}px` }}
    >
      {/* Themed header */}
      <div className="relative flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-2">
        <span className="shrink-0 text-xs font-semibold text-foreground">Preview</span>
        <StatusPill state={panelState} />
        <span className="min-w-0 flex-1" />
        {/* Icon cluster */}
        <div className="flex shrink-0 items-center gap-0.5">
          {headerMode === "quality" && !isBrowserProject ? (
            <>
              <button
                type="button"
                onClick={() => openBranch("qualityGate")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                  branch === "qualityGate" && branchOpen && "bg-accent text-foreground",
                )}
                title="Quality Gate (tests + problems)"
                aria-label="Quality Gate"
              >
                <ListChecksIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openBranch("release")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                  branch === "release" && branchOpen && "bg-accent text-foreground",
                )}
                title="Release"
                aria-label="Release"
              >
                <ArchiveIcon className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              {isBuildableProject && (
                <button
                  type="button"
                  onClick={() => openBranch("release")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                    branch === "release" && branchOpen && "bg-accent text-foreground",
                  )}
                  title={framework === "website" ? "Build website" : "Build app"}
                  aria-label={framework === "website" ? "Build website" : "Build app"}
                >
                  <ArchiveIcon className="size-3.5" />
                </button>
              )}
              {/* Demoted tiny controls — not branches: inline icon actions */}
              <button
                type="button"
                onClick={() => handleReload(true)}
                disabled={!isRunning}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                title="Hot reload"
                aria-label="Hot reload"
              >
                <RefreshCwIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setLandscape((v) => !v)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                  landscape && "bg-accent text-foreground",
                )}
                title={landscape ? "Back to portrait" : "Rotate to landscape"}
                aria-label="Rotate"
              >
                <DeviceRotateIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openBranch("screenshot")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                  branch === "screenshot" && branchOpen && "bg-accent text-foreground",
                )}
                title="Screenshot"
                aria-label="Screenshot"
              >
                <DeviceShutterIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openBranch("terminal")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                  branch === "terminal" && branchOpen && "bg-accent text-foreground",
                )}
                title="Console"
                aria-label="Console"
              >
                <TerminalIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStop()}
                disabled={!isRunning}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground hover:text-red-500 disabled:opacity-40"
                title="Stop preview"
                aria-label="Stop preview"
              >
                <DevicePowerIcon className="size-3.5" />
              </button>
            </>
          )}
          {!isBrowserProject && (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                onClick={handleToggleHeaderMode}
                className="flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                title={headerMode === "quality" ? "Show preview controls" : "Show quality tools"}
                aria-label={
                  headerMode === "quality" ? "Show preview controls" : "Show quality tools"
                }
              >
                {headerMode === "quality" ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronUpIcon className="size-3.5" />
                )}
              </button>
            </>
          )}
        </div>

        {/* Branch popup anchored to header */}
        <BranchPopup
          open={branchOpen}
          title={branchTitle}
          onClose={closeBranch}
          {...(!isBrowserProject ? { onToggleMode: handleToggleHeaderMode } : {})}
          toggleIcon={headerMode === "quality" ? "down" : "up"}
        >
          {branchContent}
        </BranchPopup>
      </div>

      {isFlutter && (
        <FlutterToolchainBanner threadId={props.threadId} isVisible={props.isVisible} />
      )}

      {/* Website uses a full browser surface; Flutter & React Native share the device frame. */}
      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", CHAT_BACKGROUND_CLASS_NAME)}
      >
        {isBrowserProject ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 text-[10px] text-slate-500">
              <span className="size-2 rounded-full bg-red-400" />
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="size-2 rounded-full bg-emerald-400" />
              <span className="ml-2 truncate">Website preview</span>
            </div>
            <div className="min-h-0 flex-1">
              {panelState.status === "starting" || isTransientStartingError(panelState) ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                  <LoaderIcon aria-hidden="true" className="size-5 animate-spin text-slate-400" />
                  <p className="text-xs font-medium text-slate-600">
                    {isWebsite ? "Starting website preview…" : "Starting preview…"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    This can take a minute on first run — compiling the app.
                  </p>
                </div>
              ) : panelState.status === "failed" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-xs text-red-500">
                  <p>{panelState.error ?? "Failed to start"}</p>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="rounded bg-slate-900 px-3 py-1.5 text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : isRunning && panelState.url !== null ? (
                <div ref={browserPreviewRef} className="relative h-full w-full overflow-hidden">
                  {landscape && browserDims ? (
                    <iframe
                      key={panelState.reloadToken}
                      src={panelState.url}
                      title={`${framework} preview`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                      className="absolute left-1/2 top-1/2 border-0 bg-white"
                      style={{
                        width: `${browserDims.h}px`,
                        height: `${browserDims.w}px`,
                        transform: "translate(-50%, -50%) rotate(90deg)",
                      }}
                    />
                  ) : (
                    <iframe
                      key={panelState.reloadToken}
                      src={panelState.url}
                      title={`${framework} preview`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                      className="h-full w-full border-0"
                    />
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-slate-500">
                  <p>Preview the responsive website in the browser surface.</p>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="rounded bg-slate-900 px-3 py-1.5 text-white"
                  >
                    <PlayIcon className="mr-1 inline size-3 fill-white" />
                    Start Preview
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <DeviceScreen
            className="min-h-0 w-full flex-1 overflow-hidden"
            kind="androidPhone"
            pixelWidth={1080}
            pixelHeight={2400}
            landscape={landscape}
          >
            <div className="flex h-full w-full flex-col items-center justify-center bg-black text-center">
              {panelState.status === "starting" || isTransientStartingError(panelState) ? (
                <div className="flex flex-col items-center gap-3 px-[12%] text-center">
                  <p className="text-[11px] font-medium text-white/90">
                    {isFlutter
                      ? "Starting Flutter preview…"
                      : isReactNative
                        ? "Starting React Native preview…"
                        : "Starting preview…"}
                  </p>
                  <span className="flex items-center gap-1.5 text-[10px] text-white/45">
                    <LoaderIcon className="size-3 animate-spin" /> Compiling bundle
                  </span>
                  <span className="text-[10px] text-white/30">This can take a few minutes on first run.</span>
                </div>
              ) : panelState.status === "failed" ? (
                <div className="flex flex-col items-center gap-3 px-[12%] text-center">
                  <p className="max-w-[240px] break-words text-[11px] leading-snug text-red-400">
                    {panelState.error ?? "Failed to start"}
                  </p>
                  <button
                    type="button"
                    onClick={handleStart}
                    className="rounded-full bg-white px-4 py-1.5 text-[11px] font-medium text-black transition-opacity hover:opacity-90"
                  >
                    Retry
                  </button>
                </div>
              ) : isRunning && panelState.url !== null ? (
                isNativePreview ? (
                  nativeScreen
                ) : (
                  <iframe
                    key={panelState.reloadToken}
                    src={panelState.url}
                    title={`${frameworkLabel} preview`}
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
                    <PlayIcon className="size-3 fill-black" /> Start Preview
                  </button>
                </div>
              )}
            </div>
          </DeviceScreen>
        )}
      </div>

      <PreviewConsoleDialog
        open={isConsoleDialogOpen}
        onOpenChange={setIsConsoleDialogOpen}
        logs={panelState.logs}
        framework={framework}
      />
    </div>
  );
}
