/**
 * GroqAdapter - Direct Groq API implementation of the generic provider adapter contract.
 *
 * @module GroqAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface GroqAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "groq";
}

export class GroqAdapter extends ServiceMap.Service<GroqAdapter, GroqAdapterShape>()(
  "caide/provider/Services/GroqAdapter",
) {}