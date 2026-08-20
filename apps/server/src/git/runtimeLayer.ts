import { Layer } from "effect";

import { GitCoreLive } from "./Layers/GitCore";
import { GitHubCliLive } from "./Layers/GitHubCli";
import { GitManagerLive } from "./Layers/GitManager";
import { GitStatusBroadcasterLive } from "./Layers/GitStatusBroadcaster";
import { ProviderTextGenerationLive } from "./Layers/ProviderTextGeneration";

export const TextGenerationLayerLive = ProviderTextGenerationLive;

export const GitManagerLayerLive = GitManagerLive.pipe(
  Layer.provideMerge(GitCoreLive),
  Layer.provideMerge(GitHubCliLive),
  Layer.provideMerge(TextGenerationLayerLive),
);

export const GitStatusBroadcasterLayerLive = GitStatusBroadcasterLive.pipe(
  Layer.provide(Layer.mergeAll(GitCoreLive, GitManagerLayerLive)),
);

export const GitLayerLive = Layer.mergeAll(
  GitCoreLive,
  GitHubCliLive,
  GitManagerLayerLive,
  GitStatusBroadcasterLayerLive,
);
