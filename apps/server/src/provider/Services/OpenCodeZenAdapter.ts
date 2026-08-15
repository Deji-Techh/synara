/**
 * OpenCodeZenAdapter - Direct OpenCode Zen API implementation of the generic provider adapter contract.
 *
 * OpenCode Zen is OpenAI chat-completions compatible (
 * https://opencode.ai/zen/v1 ). Unlike the `opencode` CLI provider, this one
 * talks to the hosted API directly with an API key.
 *
 * @module OpenCodeZenAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface OpenCodeZenAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "opencodeZen";
}

export class OpenCodeZenAdapter extends ServiceMap.Service<
  OpenCodeZenAdapter,
  OpenCodeZenAdapterShape
>()("caide/provider/Services/OpenCodeZenAdapter") {}