/**
 * EngineAdapter - Service contract for the Flutter Builder engine provider.
 *
 * This adapter owns the engine process lifecycle and protocol semantics. It
 * spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and emits
 * canonical provider runtime events into Synara's orchestration stream.
 *
 * @module EngineAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface EngineAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "engine";
}

export class EngineAdapter extends ServiceMap.Service<EngineAdapter, EngineAdapterShape>()(
  "synara/provider/Services/EngineAdapter",
) {}
