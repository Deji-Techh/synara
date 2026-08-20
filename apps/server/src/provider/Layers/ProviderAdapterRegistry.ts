/**
 * ProviderAdapterRegistryLive - In-memory provider adapter lookup layer.
 *
 * Binds provider kinds (engine + API providers) to concrete adapter services.
 * This layer only performs adapter lookup; it does not route session-scoped
 * calls or own provider lifecycle workflows.
 *
 * @module ProviderAdapterRegistryLive
 */
import { Effect, Layer } from "effect";

import { ProviderUnsupportedError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import {
  ProviderAdapterRegistry,
  type ProviderAdapterRegistryShape,
} from "../Services/ProviderAdapterRegistry.ts";
import { EngineAdapter } from "../Services/EngineAdapter.ts";
import { OpenAiAdapter } from "../Services/OpenAiAdapter.ts";
import { AnthropicAdapter } from "../Services/AnthropicAdapter.ts";
import { GoogleAdapter } from "../Services/GoogleAdapter.ts";
import { OpenRouterAdapter } from "../Services/OpenRouterAdapter.ts";
import { OllamaAdapter } from "../Services/OllamaAdapter.ts";
import { DeepseekAdapter } from "../Services/DeepseekAdapter.ts";
import { GroqAdapter } from "../Services/GroqAdapter.ts";
import { MistralAdapter } from "../Services/MistralAdapter.ts";
import { TogetherAdapter } from "../Services/TogetherAdapter.ts";
import { CohereAdapter } from "../Services/CohereAdapter.ts";
import { XaiAdapter } from "../Services/XaiAdapter.ts";
import { FireworksAdapter } from "../Services/FireworksAdapter.ts";
import { OpenCodeZenAdapter } from "../Services/OpenCodeZenAdapter.ts";
import { OpenCodeGoAdapter } from "../Services/OpenCodeGoAdapter.ts";

export interface ProviderAdapterRegistryLiveOptions {
  readonly adapters?: ReadonlyArray<ProviderAdapterShape<ProviderAdapterError>>;
}

const makeProviderAdapterRegistry = (options?: ProviderAdapterRegistryLiveOptions) =>
  Effect.gen(function* () {
    const adapters =
      options?.adapters !== undefined
        ? options.adapters
        : [
            yield* EngineAdapter,
            yield* OpenAiAdapter,
            yield* AnthropicAdapter,
            yield* GoogleAdapter,
            yield* OpenRouterAdapter,
            yield* OllamaAdapter,
            yield* DeepseekAdapter,
            yield* GroqAdapter,
            yield* MistralAdapter,
            yield* TogetherAdapter,
            yield* CohereAdapter,
            yield* XaiAdapter,
            yield* FireworksAdapter,
            yield* OpenCodeZenAdapter,
            yield* OpenCodeGoAdapter,
          ];
    const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));

    const getByProvider: ProviderAdapterRegistryShape["getByProvider"] = (provider) => {
      const adapter = byProvider.get(provider);
      if (!adapter) {
        return Effect.fail(new ProviderUnsupportedError({ provider }));
      }
      return Effect.succeed(adapter);
    };

    const listProviders: ProviderAdapterRegistryShape["listProviders"] = () =>
      Effect.sync(() => Array.from(byProvider.keys()));

    return {
      getByProvider,
      listProviders,
    } satisfies ProviderAdapterRegistryShape;
  });

export const ProviderAdapterRegistryLive = Layer.effect(
  ProviderAdapterRegistry,
  makeProviderAdapterRegistry(),
);
