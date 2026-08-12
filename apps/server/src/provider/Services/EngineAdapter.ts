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
  PreviewReloadResult,
  PreviewStartResult,
  PreviewState,
  PreviewStopResult,
  ThreadId,
} from "@caide/contracts";
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * Preview operations on an engine session. Mirrors the engine's
 * preview/* JSON-RPC methods; the thread's session owns the flutter process.
 */
export interface EnginePreviewOps {
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
}

export interface EngineAdapterShape
  extends ProviderAdapterShape<ProviderAdapterError>, EnginePreviewOps {
  readonly provider: "engine";
}

export class EngineAdapter extends ServiceMap.Service<EngineAdapter, EngineAdapterShape>()(
  "caide/provider/Services/EngineAdapter",
) {}
