/**
 * OpenCodeGoAdapter - Direct OpenCode Go API implementation of the generic provider adapter contract.
 *
 * OpenCode Go is OpenAI chat-completions compatible (
 * https://opencode.ai/go/v1 ). Mirrors OpenCodeZenAdapter.
 *
 * @module OpenCodeGoAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface OpenCodeGoAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "opencodeGo";
}

export class OpenCodeGoAdapter extends ServiceMap.Service<
  OpenCodeGoAdapter,
  OpenCodeGoAdapterShape
>()("caide/provider/Services/OpenCodeGoAdapter") {}
