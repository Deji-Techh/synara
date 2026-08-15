/**
 * TogetherAdapter - Direct Together API implementation of the generic provider adapter contract.
 *
 * @module TogetherAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface TogetherAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "together";
}

export class TogetherAdapter extends ServiceMap.Service<TogetherAdapter, TogetherAdapterShape>()(
  "caide/provider/Services/TogetherAdapter",
) {}