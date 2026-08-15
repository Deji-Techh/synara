/**
 * CohereAdapter - Direct Cohere API implementation of the generic provider adapter contract.
 *
 * @module CohereAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface CohereAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "cohere";
}

export class CohereAdapter extends ServiceMap.Service<CohereAdapter, CohereAdapterShape>()(
  "caide/provider/Services/CohereAdapter",
) {}