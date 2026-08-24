/**
 * EngineAdapter - Service contract for the Flutter Builder engine provider.
 *
 * This adapter owns the engine process lifecycle and protocol semantics. It
 * spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and emits
 * canonical provider runtime events into Caide's orchestration stream.
 *
 * @module EngineAdapter
 */
import { ServiceMap, Stream } from "effect";
import type { Effect } from "effect";

import type {
  Goal,
  GoalActivityEvent,
  GoalExecutionTarget,
  GoalId,
  GoalRun,
  GoalStatus,
  PreviewAnalyzeResult,
  PreviewBuildStartResult,
  PreviewBuildStateResult,
  PreviewReloadResult,
  PreviewStartResult,
  PreviewState,
  PreviewStopResult,
  PreviewTestResult,
  PreviewScreenshotResult,
  FlutterToolchainStatusResult,
  FlutterToolchainInstallResult,
} from "@caide/contracts";
import type { ProjectFramework, ProviderSession, ThreadId } from "@caide/contracts";
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * Preview operations on an engine session. Mirrors the engine's
 * preview/* JSON-RPC methods; the thread's session owns the flutter process.
 */
export interface EnginePreviewOps {
  /**
   * Lazily start a preview-only engine session for a thread that has none.
   * Unlike a chat session this publishes no lifecycle events, so a thread
   * bound to another provider can preview without its session binding gaining
   * engine events.
   */
  startPreviewSession(input: {
    threadId: ThreadId;
    cwd?: string;
  }): Effect.Effect<ProviderSession, ProviderAdapterError>;
  previewStart(input: {
    threadId: ThreadId;
    appDir?: string;
    port?: number;
    hostname?: string;
    device?: "web-server" | "emulator" | "simulator";
    deviceId?: string;
  }): Effect.Effect<PreviewStartResult, ProviderAdapterError>;
  previewStop(input: {
    threadId: ThreadId;
  }): Effect.Effect<PreviewStopResult, ProviderAdapterError>;
  previewReload(input: {
    threadId: ThreadId;
    hotReload: boolean;
  }): Effect.Effect<PreviewReloadResult, ProviderAdapterError>;
  previewState(input: { threadId: ThreadId }): Effect.Effect<PreviewState, ProviderAdapterError>;
  previewAnalyze(input: {
    threadId: ThreadId;
  }): Effect.Effect<PreviewAnalyzeResult, ProviderAdapterError>;
  previewTest(input: {
    threadId: ThreadId;
    testPath?: string;
  }): Effect.Effect<PreviewTestResult, ProviderAdapterError>;
  previewBuildStart(input: {
    threadId: ThreadId;
    appDir?: string;
    target: "apk" | "appbundle" | "ipa" | "web";
    channel?: "debug" | "profile" | "release";
    signing?: {
      keystorePath: string;
      keyAlias: string;
      storePassword: string;
      keyPassword: string;
    } | null;
  }): Effect.Effect<PreviewBuildStartResult, ProviderAdapterError>;
  previewBuildState(input: {
    threadId: ThreadId;
    buildId: string;
  }): Effect.Effect<PreviewBuildStateResult, ProviderAdapterError>;
  previewScreenshot(input: {
    threadId: ThreadId;
    deviceId?: string;
    appDir?: string;
  }): Effect.Effect<PreviewScreenshotResult, ProviderAdapterError>;
  previewDevices(input: { threadId: ThreadId }): Effect.Effect<
    {
      devices: Array<{
        id: string;
        name: string;
        isEmulator: boolean;
        platform?: "android" | "ios" | "web";
      }>;
    },
    ProviderAdapterError
  >;
  flutterToolchainStatus(input: { threadId: ThreadId }): Effect.Effect<
    {
      supported: boolean;
      installed: boolean;
      version: string;
      root: string;
      sdkPath: string;
      flutterBin: string;
      estimatedDownloadBytes: number;
      unsupportedReason: string | null;
      installProgress?: FlutterToolchainStatusResult["installProgress"];
    },
    ProviderAdapterError
  >;
  flutterToolchainInstall(input: {
    threadId: ThreadId;
  }): Effect.Effect<FlutterToolchainInstallResult, ProviderAdapterError>;
}

/**
 * Database integration ops (Neon + Supabase). The adapter relays allowlisted
 * engine dyad-IPC channels verbatim; the engine owns validation of each
 * channel's payload.
 */
export interface EngineDatabaseOps {
  databaseInvoke(input: {
    threadId: ThreadId;
    channel: string;
    payload?: unknown;
  }): Effect.Effect<{ value: unknown }, ProviderAdapterError>;
}

/**
 * Goals API proxied onto the shared engine process. The engine owns goal
 * state; the adapter relays CRUD verbatim (engine-shaped payloads) and
 * streams goal lifecycle events for orchestration + WS consumers.
 *
 * Engine-native shapes: appId and chatId are the engine's numeric rowids.
 * Caide-side identity (ProjectId/ThreadId) is translated by the layer that
 * owns the projection (wsRpc); the provider adapter stays engine-shaped.
 */
/**
 * Dyad-style app creation on the shared engine process: the engine slugifies,
 * scaffolds the Flutter template, git-inits, inserts the app row + first chat
 * and backfills the initial commit hash. Returns engine-native identities;
 * the caller binds Caide project/thread to `appPath`.
 */
export interface EngineCreateAppResult {
  readonly appId: number;
  readonly chatId: number;
  /** Absolute workspace path (~/caide-apps/<slug>). */
  readonly appPath: string;
}

export interface EngineGoalsApi {
  create(input: {
    appId?: number | null | undefined;
    chatId?: number | undefined;
    title?: string | undefined;
    objective: string;
    definitionOfDone?: ReadonlyArray<string> | undefined;
    constraints?: ReadonlyArray<string> | undefined;
    executionTarget?: GoalExecutionTarget | undefined;
  }): Effect.Effect<Goal, ProviderAdapterError>;
  get(input: { goalId: GoalId }): Effect.Effect<Goal, ProviderAdapterError>;
  getActive(input: {
    appId?: number | null | undefined;
  }): Effect.Effect<Goal | null, ProviderAdapterError>;
  list(input: {
    appId?: number | undefined;
    statuses?: ReadonlyArray<GoalStatus> | undefined;
  }): Effect.Effect<Array<Goal>, ProviderAdapterError>;
  listActivity(input: {
    goalId: GoalId;
    limit?: number | undefined;
  }): Effect.Effect<Array<GoalActivityEvent>, ProviderAdapterError>;
  listRuns(input: {
    goalId: GoalId;
    limit?: number | undefined;
  }): Effect.Effect<Array<GoalRun>, ProviderAdapterError>;
  pause(input: {
    goalId: GoalId;
    reason?: string | undefined;
  }): Effect.Effect<Goal, ProviderAdapterError>;
  resume(input: { goalId: GoalId }): Effect.Effect<Goal, ProviderAdapterError>;
  cancel(input: {
    goalId: GoalId;
    reason?: string | undefined;
  }): Effect.Effect<Goal, ProviderAdapterError>;
  edit(input: {
    goalId: GoalId;
    title?: string | undefined;
    objective?: string | undefined;
    definitionOfDone?: ReadonlyArray<string> | undefined;
    constraints?: ReadonlyArray<string> | undefined;
    executionTarget?: GoalExecutionTarget | undefined;
  }): Effect.Effect<Goal, ProviderAdapterError>;
  steer(input: { goalId: GoalId; instruction: string }): Effect.Effect<Goal, ProviderAdapterError>;
  retry(input: { goalId: GoalId }): Effect.Effect<Goal, ProviderAdapterError>;
  verify(input: { goalId: GoalId }): Effect.Effect<Goal, ProviderAdapterError>;

  /**
   * Resolve the engine app rowid backing a workspace root (app path).
   * Matches an existing app by path; when none exists the app is imported
   * verbatim (same provisioning as thread chats). Returns null when no
   * path is given. Used by the M4b activity view to join engine goal runs
   * onto Caide projects.
   */
  resolveAppId(input: {
    workspaceRoot: string;
  }): Effect.Effect<number | null, ProviderAdapterError>;
}

export interface GoalDomainEvent {
  readonly type: "goal.updated" | "goal.run-requested" | "goal.control-requested";
  readonly payload: unknown;
}

/**
 * Live engine-subagent lifecycle event relayed from the engine's
 * `subagent:updated` notification. appId/chatId are engine-native rowids;
 * scoping to Caide threads happens at the WS boundary.
 */
export interface EngineSubagentEvent {
  readonly appId?: number | undefined;
  readonly chatId?: number | undefined;
  readonly taskId: string;
  readonly role: string;
  readonly task: string;
  readonly status: "running" | "completed" | "failed";
  readonly startedAt: number;
}

/**
 * Snapshot of currently-registered engine subagents (running ones from the
 * active map plus recently spawned tasks). Mirrors the engine's
 * `sidebar:getActiveSubagents` contract.
 */
export interface EngineActiveSubagent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startedAt: number;
  readonly status?: "running" | "completed" | "failed" | undefined;
  readonly appId?: number | undefined;
  readonly chatId?: number | undefined;
}

export interface EngineSubagentsApi {
  getActive(input: {
    appId?: number | null | undefined;
  }): Effect.Effect<Array<EngineActiveSubagent>, ProviderAdapterError>;
}

export interface EngineAdapterShape
  extends ProviderAdapterShape<ProviderAdapterError>, EnginePreviewOps, EngineDatabaseOps {
  readonly provider: "engine";
  readonly goals: EngineGoalsApi;
  readonly streamGoalDomainEvents: Stream.Stream<GoalDomainEvent>;
  readonly subagents: EngineSubagentsApi;
  readonly streamSubagentEvents: Stream.Stream<EngineSubagentEvent>;
  createApp(input: {
    name: string;
    framework?: ProjectFramework;
  }): Effect.Effect<EngineCreateAppResult, ProviderAdapterError>;
}

export class EngineAdapter extends ServiceMap.Service<EngineAdapter, EngineAdapterShape>()(
  "caide/provider/Services/EngineAdapter",
) {}
