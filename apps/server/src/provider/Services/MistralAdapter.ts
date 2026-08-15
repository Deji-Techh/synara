/**
 * MistralAdapter - Direct Mistral API implementation of the generic provider adapter contract.
 *
 * @module MistralAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface MistralAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "mistral";
}

export class MistralAdapter extends ServiceMap.Service<MistralAdapter, MistralAdapterShape>()(
  "caide/provider/Services/MistralAdapter",
) {}