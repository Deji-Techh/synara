/**
 * OpenAiAdapter - Direct OpenAI API implementation of the generic provider adapter contract.
 *
 * @module OpenAiAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface OpenAiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "openai";
}

export class OpenAiAdapter extends ServiceMap.Service<OpenAiAdapter, OpenAiAdapterShape>()(
  "caide/provider/Services/OpenAiAdapter",
) {}
