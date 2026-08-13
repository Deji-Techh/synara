/**
 * GoogleAdapter - Direct Google Gemini API implementation of the generic provider adapter contract.
 *
 * @module GoogleAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface GoogleAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "google";
}

export class GoogleAdapter extends ServiceMap.Service<GoogleAdapter, GoogleAdapterShape>()(
  "caide/provider/Services/GoogleAdapter",
) {}
