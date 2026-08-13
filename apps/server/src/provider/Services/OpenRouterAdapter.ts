/**
 * OpenRouterAdapter - Direct OpenRouter API implementation of the generic provider adapter contract.
 *
 * @module OpenRouterAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface OpenRouterAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "openrouter";
}

export class OpenRouterAdapter extends ServiceMap.Service<
  OpenRouterAdapter,
  OpenRouterAdapterShape
>()("caide/provider/Services/OpenRouterAdapter") {}
