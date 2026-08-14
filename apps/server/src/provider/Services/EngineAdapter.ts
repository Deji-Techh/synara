/**
 * EngineAdapter - Service contract for the Flutter Builder engine provider.
 *
 * This adapter owns the engine process lifecycle and protocol semantics. It
 * spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and emits
 * canonical provider runtime events into Caide's orchestration stream.
 *
 * @module EngineAdapter
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type {
  PreviewAnalyzeResult,
  PreviewBuildStartResult,
  PreviewBuildStateResult,
  PreviewReloadResult,
  PreviewStartResult,
  PreviewState,
  PreviewStopResult,
  PreviewTestResult,
  PreviewScreenshotResult,
  ThreadId,
} from "@caide/contracts";
import type { ProviderSession } from "@caide/contracts";
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
    target: "apk" | "appbundle" | "ipa";
    channel?: "debug" | "profile" | "release";
  }): Effect.Effect<PreviewBuildStartResult, ProviderAdapterError>;
  previewBuildState(input: {
    threadId: ThreadId;
    buildId: string;
  }): Effect.Effect<PreviewBuildStateResult, ProviderAdapterError>;
  previewScreenshot(input: {
    threadId: ThreadId;
  }): Effect.Effect<PreviewScreenshotResult, ProviderAdapterError>;
}

export interface EngineAdapterShape
  extends ProviderAdapterShape<ProviderAdapterError>, EnginePreviewOps {
  readonly provider: "engine";
}

export class EngineAdapter extends ServiceMap.Service<EngineAdapter, EngineAdapterShape>()(
  "caide/provider/Services/EngineAdapter",
) {}
