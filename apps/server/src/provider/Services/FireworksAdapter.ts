/**
 * FireworksAdapter - Direct Fireworks AI API implementation of the generic provider adapter contract.
 *
 * @module FireworksAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface FireworksAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "fireworks";
}

export class FireworksAdapter extends ServiceMap.Service<FireworksAdapter, FireworksAdapterShape>()(
  "caide/provider/Services/FireworksAdapter",
) {}