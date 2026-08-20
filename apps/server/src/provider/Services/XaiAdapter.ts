/**
 * XaiAdapter - Direct xAI API implementation of the generic provider adapter contract.
 *
 * @module XaiAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface XaiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "xai";
}

export class XaiAdapter extends ServiceMap.Service<XaiAdapter, XaiAdapterShape>()(
  "caide/provider/Services/XaiAdapter",
) {}
