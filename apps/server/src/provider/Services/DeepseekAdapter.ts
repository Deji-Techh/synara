/**
 * DeepseekAdapter - Direct DeepSeek API implementation of the generic provider adapter contract.
 *
 * @module DeepseekAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface DeepseekAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "deepseek";
}

export class DeepseekAdapter extends ServiceMap.Service<DeepseekAdapter, DeepseekAdapterShape>()(
  "caide/provider/Services/DeepseekAdapter",
) {}