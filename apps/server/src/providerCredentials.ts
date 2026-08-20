// FILE: providerCredentials.ts
// Purpose: Owns server-only API key credentials used to connect to external providers.
// Layer: Server provider security boundary

import type { ApiProviderKind } from "@caide/contracts";
import { Effect, Layer, ServiceMap } from "effect";

import { ServerSecretStoreLive } from "./auth/Layers/ServerSecretStore";
import { ServerSecretStore, type SecretStoreError } from "./auth/Services/ServerSecretStore";

const apiKeySecretName = (provider: ApiProviderKind): string => `provider-${provider}-api-key`;

export interface ProviderCredentialsShape {
  readonly getApiKey: (provider: ApiProviderKind) => Effect.Effect<string | null, SecretStoreError>;
  readonly replaceApiKey: (
    provider: ApiProviderKind,
    apiKey: string | null,
  ) => Effect.Effect<void, SecretStoreError>;
  readonly isApiKeyConfigured: (
    provider: ApiProviderKind,
  ) => Effect.Effect<boolean, SecretStoreError>;
}

export class ProviderCredentials extends ServiceMap.Service<
  ProviderCredentials,
  ProviderCredentialsShape
>()("caide/providerCredentials/ProviderCredentials") {}

export const resolveProviderApiKey = (provider: ApiProviderKind) =>
  Effect.gen(function* () {
    const credentials = yield* ProviderCredentials;
    return (yield* credentials.getApiKey(provider)) ?? undefined;
  }).pipe(Effect.orDie);

export const makeProviderApiKeyResolver =
  (credentials: ProviderCredentialsShape) =>
  (provider: ApiProviderKind): Effect.Effect<string | undefined> =>
    credentials.getApiKey(provider).pipe(
      Effect.map((key) => key ?? undefined),
      Effect.orDie,
    );

const makeProviderCredentials = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const getApiKey: ProviderCredentialsShape["getApiKey"] = (provider) =>
    secrets.get(apiKeySecretName(provider)).pipe(
      Effect.map((value) => {
        if (!value || value.byteLength === 0) return null;
        const key = decoder.decode(value);
        return key.length > 0 ? key : null;
      }),
    );

  const replaceApiKey: ProviderCredentialsShape["replaceApiKey"] = (provider, apiKey) => {
    const normalized = apiKey?.trim() ?? "";
    return normalized.length > 0
      ? secrets.set(apiKeySecretName(provider), encoder.encode(normalized))
      : secrets.remove(apiKeySecretName(provider));
  };

  const isApiKeyConfigured: ProviderCredentialsShape["isApiKeyConfigured"] = (provider) =>
    getApiKey(provider).pipe(Effect.map((key) => key !== null));

  return {
    getApiKey,
    replaceApiKey,
    isApiKeyConfigured,
  } satisfies ProviderCredentialsShape;
});

export const ProviderCredentialsLive = Layer.effect(
  ProviderCredentials,
  makeProviderCredentials,
).pipe(Layer.provide(ServerSecretStoreLive));
