import { Effect, Layer } from "effect";

import { AgentGatewayCredentialsWithSecretsLive } from "../agentGateway/Layers/AgentGatewayCredentials";
import { ServerConfig } from "../config";
import { ProviderCredentials, ProviderCredentialsLive } from "../providerCredentials";
import { ServerSettingsLive } from "../serverSettings";
import { ServerSecretStoreLive } from "../auth/Layers/ServerSecretStore";
import { makeEventNdjsonLogger } from "./Layers/EventNdjsonLogger";
import { ProviderAdapterRegistryLive } from "./Layers/ProviderAdapterRegistry";
import { EngineAdapterLive } from "./Layers/EngineAdapter";
import {
  OpenAiAdapterLive,
  AnthropicAdapterLive,
  GoogleAdapterLive,
  OpenRouterAdapterLive,
  OllamaAdapterLive,
  DeepseekAdapterLive,
  GroqAdapterLive,
  MistralAdapterLive,
  TogetherAdapterLive,
  CohereAdapterLive,
  XaiAdapterLive,
  FireworksAdapterLive,
  OpenCodeZenAdapterLive,
} from "./Layers/ApiAdapter";
import { ProviderDiscoveryServiceLive } from "./Layers/ProviderDiscoveryService";
import { makeDurableProviderServiceLive } from "./Layers/ProviderService";
import { ProviderSessionDirectoryLive } from "./Layers/ProviderSessionDirectory";
import { ProviderSessionRuntimeRepositoryLive } from "../persistence/Layers/ProviderSessionRuntime";
import { ProviderRuntimeEventRepositoryLive } from "../persistence/Layers/ProviderRuntimeEvents";

export function makeServerProviderLayer(
  options: {
    readonly agentGatewayCredentialsLayer?: typeof AgentGatewayCredentialsWithSecretsLive;
  } = {},
) {
  return Effect.gen(function* () {
    const credentials = yield* ProviderCredentials;
    const { logProviderEvents, providerEventLogPath } = yield* ServerConfig;
    const nativeEventLogger = logProviderEvents
      ? yield* makeEventNdjsonLogger(providerEventLogPath, {
          stream: "native",
        })
      : undefined;
    const canonicalEventLogger = logProviderEvents
      ? yield* makeEventNdjsonLogger(providerEventLogPath, {
          stream: "canonical",
        })
      : undefined;
    const providerSessionDirectoryLayer = ProviderSessionDirectoryLive.pipe(
      Layer.provide(ProviderSessionRuntimeRepositoryLive),
    );
    const agentGatewayCredentialsLayer =
      options.agentGatewayCredentialsLayer ?? AgentGatewayCredentialsWithSecretsLive;
    const credentialsLayer = Layer.succeed(ProviderCredentials, credentials);
    const openAiAdapterLayer = OpenAiAdapterLive.pipe(Layer.provide(credentialsLayer));
    const anthropicAdapterLayer = AnthropicAdapterLive.pipe(Layer.provide(credentialsLayer));
    const googleAdapterLayer = GoogleAdapterLive.pipe(Layer.provide(credentialsLayer));
    const openRouterAdapterLayer = OpenRouterAdapterLive.pipe(Layer.provide(credentialsLayer));
    const ollamaAdapterLayer = OllamaAdapterLive.pipe(Layer.provide(credentialsLayer));
    const deepseekAdapterLayer = DeepseekAdapterLive.pipe(Layer.provide(credentialsLayer));
    const groqAdapterLayer = GroqAdapterLive.pipe(Layer.provide(credentialsLayer));
    const mistralAdapterLayer = MistralAdapterLive.pipe(Layer.provide(credentialsLayer));
    const togetherAdapterLayer = TogetherAdapterLive.pipe(Layer.provide(credentialsLayer));
    const cohereAdapterLayer = CohereAdapterLive.pipe(Layer.provide(credentialsLayer));
    const xaiAdapterLayer = XaiAdapterLive.pipe(Layer.provide(credentialsLayer));
    const fireworksAdapterLayer = FireworksAdapterLive.pipe(Layer.provide(credentialsLayer));
    const openCodeZenAdapterLayer = OpenCodeZenAdapterLive.pipe(Layer.provide(credentialsLayer));
    const apiAdaptersLayer = Layer.mergeAll(
      openAiAdapterLayer,
      anthropicAdapterLayer,
      googleAdapterLayer,
      openRouterAdapterLayer,
      ollamaAdapterLayer,
      deepseekAdapterLayer,
      groqAdapterLayer,
      mistralAdapterLayer,
      togetherAdapterLayer,
      cohereAdapterLayer,
      xaiAdapterLayer,
      fireworksAdapterLayer,
      openCodeZenAdapterLayer,
    );
    const adapterRegistryLayer = ProviderAdapterRegistryLive.pipe(
      Layer.provide(
        EngineAdapterLive.pipe(
          Layer.provide(ServerSettingsLive),
          Layer.provide(ServerSecretStoreLive),
        ),
      ),
      Layer.provide(apiAdaptersLayer),
      Layer.provideMerge(providerSessionDirectoryLayer),
      Layer.provideMerge(credentialsLayer),
    );
    const providerServiceLayer = makeDurableProviderServiceLive(
      canonicalEventLogger ? { canonicalEventLogger } : undefined,
    ).pipe(
      Layer.provide(adapterRegistryLayer),
      Layer.provide(providerSessionDirectoryLayer),
      Layer.provide(ProviderRuntimeEventRepositoryLive),
    );
    const providerDiscoveryLayer = ProviderDiscoveryServiceLive.pipe(
      Layer.provide(adapterRegistryLayer),
      Layer.provide(ServerSettingsLive),
    );
    return Layer.mergeAll(
      providerServiceLayer,
      providerDiscoveryLayer,
      adapterRegistryLayer,
      providerSessionDirectoryLayer,
    );
  }).pipe(Effect.provide(ProviderCredentialsLive.pipe(Layer.orDie)), Layer.unwrap);
}
