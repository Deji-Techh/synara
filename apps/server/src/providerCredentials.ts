import { Effect, Layer, ServiceMap } from "effect";
import { ProviderKind } from "@caide/contracts";
import { ServerSecretStore } from "./auth/Services/ServerSecretStore";

export interface ProviderCredentialsShape {
  readonly isApiKeyConfigured: (provider: ProviderKind) => Effect.Effect<boolean>;
  readonly getApiKey: (provider: ProviderKind) => Effect.Effect<string | null>;
  readonly replaceApiKey: (provider: ProviderKind, apiKey: string | null) => Effect.Effect<void>;
}

export class ProviderCredentials extends ServiceMap.Tag("ProviderCredentials")<
  ProviderCredentials,
  ProviderCredentialsShape
>() {}

export const makeProviderCredentials = Effect.gen(function* () {
  const secretStore = yield* ServerSecretStore;

  const secretKey = (provider: ProviderKind) => `provider-api-key:${provider}`;

  const isApiKeyConfigured = (provider: ProviderKind) =>
    secretStore.get(secretKey(provider)).pipe(
      Effect.map((secret) => secret !== null && secret.length > 0),
      Effect.orElseSucceed(() => false),
    );

  const getApiKey = (provider: ProviderKind) =>
    secretStore.get(secretKey(provider)).pipe(
      Effect.map((bytes) => (bytes ? new TextDecoder().decode(bytes) : null)),
      Effect.orElseSucceed(() => null),
    );

  const replaceApiKey = (provider: ProviderKind, apiKey: string | null) =>
    apiKey && apiKey.length > 0
      ? secretStore.set(secretKey(provider), apiKey).pipe(Effect.asVoid)
      : secretStore.set(secretKey(provider), "").pipe(Effect.asVoid);

  return {
    isApiKeyConfigured,
    getApiKey,
    replaceApiKey,
  };
});

export const ProviderCredentialsLive = Layer.effect(
  ProviderCredentials,
  makeProviderCredentials,
);
