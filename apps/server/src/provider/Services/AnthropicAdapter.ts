/**
 * AnthropicAdapter - Direct Anthropic API implementation of the generic provider adapter contract.
 *
 * @module AnthropicAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface AnthropicAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "anthropic";
}

export class AnthropicAdapter extends ServiceMap.Service<AnthropicAdapter, AnthropicAdapterShape>()(
  "caide/provider/Services/AnthropicAdapter",
) {}
