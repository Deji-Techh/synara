// FILE: providerCredentials.ts
// Purpose: Owns server-only credentials used to connect to external provider servers.
// Layer: Server provider security boundary

import type { ApiProviderKind } from "@caide/contracts";
import { Effect, Layer, ServiceMap } from "effect";

import { ServerSecretStoreLive } from "./auth/Layers/ServerSecretStore";
import { ServerSecretStore, type SecretStoreError } from "./auth/Services/ServerSecretStore";

export type ExternalProviderServer = "kilo" | "opencode";

const secretName = (provider: ExternalProviderServer): string =>
  `provider-${provider}-server-password`;

const apiKeySecretName = (provider: ApiProviderKind): string => `provider-${provider}-api-key`;

export interface ProviderCredentialsShape {
  readonly getServerPassword: (
    provider: ExternalProviderServer,
  ) => Effect.Effect<string | null, SecretStoreError>;
  readonly replaceServerPassword: (
    provider: ExternalProviderServer,
    password: string | null,
  ) => Effect.Effect<void, SecretStoreError>;
  readonly isServerPasswordConfigured: (
    provider: ExternalProviderServer,
  ) => Effect.Effect<boolean, SecretStoreError>;
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

export const resolveProviderServerPassword = (provider: ExternalProviderServer) =>
  Effect.gen(function* () {
    const credentials = yield* ProviderCredentials;
    return (yield* credentials.getServerPassword(provider)) ?? undefined;
  }).pipe(Effect.orDie);

export const makeProviderServerPasswordResolver =
  (credentials: ProviderCredentialsShape) =>
  (provider: ExternalProviderServer): Effect.Effect<string | undefined> =>
    credentials.getServerPassword(provider).pipe(
      Effect.map((password) => password ?? undefined),
      Effect.orDie,
    );

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

  const getServerPassword: ProviderCredentialsShape["getServerPassword"] = (provider) =>
    secrets.get(secretName(provider)).pipe(
      Effect.map((value) => {
        if (!value || value.byteLength === 0) return null;
        const password = decoder.decode(value);
        return password.length > 0 ? password : null;
      }),
    );

  const replaceServerPassword: ProviderCredentialsShape["replaceServerPassword"] = (
    provider,
    password,
  ) => {
    const normalized = password?.trim() ?? "";
    return normalized.length > 0
      ? secrets.set(secretName(provider), encoder.encode(normalized))
      : secrets.remove(secretName(provider));
  };

  const isServerPasswordConfigured: ProviderCredentialsShape["isServerPasswordConfigured"] = (
    provider,
  ) => getServerPassword(provider).pipe(Effect.map((password) => password !== null));

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
    getServerPassword,
    replaceServerPassword,
    isServerPasswordConfigured,
    getApiKey,
    replaceApiKey,
    isApiKeyConfigured,
  } satisfies ProviderCredentialsShape;
});

export const ProviderCredentialsLive = Layer.effect(
  ProviderCredentials,
  makeProviderCredentials,
).pipe(Layer.provide(ServerSecretStoreLive));
