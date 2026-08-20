/**
 * ServerSettings - Server-authoritative settings persistence.
 *
 * Owns settings that affect server-side behavior. The web app can continue to
 * keep UI-only preferences in local storage while these values become durable
 * and process-authoritative on the server.
 */
import {
  API_PROVIDER_KINDS,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_SERVER_SETTINGS,
  type ModelSelection,
  type ProviderWithDefaultModel,
  ServerSettings,
  ServerSettingsError,
  type ServerSettingsPatch,
  type ServerSettingsView,
} from "@caide/contracts";
import { deepMerge, type DeepPartial } from "@caide/shared/Struct";
import { applyServerSettingsPatch } from "@caide/shared/serverSettings";
import {
  Cause,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Path,
  PubSub,
  Ref,
  Schema,
  SchemaIssue,
  ServiceMap,
  Stream,
} from "effect";
import * as Semaphore from "effect/Semaphore";
import { writeFileStringAtomically } from "./atomicWrite";
import { ServerConfig } from "./config";
import { ProviderCredentials, ProviderCredentialsLive } from "./providerCredentials";

export interface ServerSettingsShape {
  readonly start: Effect.Effect<void, ServerSettingsError>;
  readonly ready: Effect.Effect<void, ServerSettingsError>;
  readonly getSettings: Effect.Effect<ServerSettings, ServerSettingsError>;
  readonly getSettingsView: Effect.Effect<ServerSettingsView, ServerSettingsError>;
  readonly getSnapshot: Effect.Effect<ServerSettingsSnapshot, ServerSettingsError>;
  readonly updateSettings: (
    patch: ServerSettingsPatch,
  ) => Effect.Effect<ServerSettings, ServerSettingsError>;
  readonly updateSettingsView: (
    patch: ServerSettingsPatch,
  ) => Effect.Effect<ServerSettingsView, ServerSettingsError>;
  readonly streamChanges: Stream.Stream<ServerSettings>;
  readonly streamViews: Stream.Stream<ServerSettingsView>;
}

export interface ServerSettingsSnapshot {
  readonly revision: number;
  readonly migrationVersion: number;
  readonly settings: ServerSettings;
}

const SERVER_SETTINGS_MIGRATION_VERSION = 2;
const PREVIOUS_GIT_TEXT_GENERATION_MODEL = "gpt-5.4-mini";

function migrateSettings(settings: ServerSettings, migrationVersion: number): ServerSettings {
  const selection = settings.textGenerationModelSelection;
  if (
    migrationVersion >= 2 ||
    selection.provider !== "openai" ||
    selection.model !== PREVIOUS_GIT_TEXT_GENERATION_MODEL
  ) {
    return settings;
  }

  return {
    ...settings,
    textGenerationModelSelection: {
      ...selection,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
    },
  };
}

export function toServerSettingsView(settings: ServerSettings): ServerSettingsView {
  return settings;
}

export class ServerSettingsService extends ServiceMap.Service<
  ServerSettingsService,
  ServerSettingsShape
>()("caide/serverSettings/ServerSettingsService") {
  static readonly layerTest = (overrides: DeepPartial<ServerSettings> = {}) =>
    Layer.effect(
      ServerSettingsService,
      Effect.gen(function* () {
        const currentSettingsRef = yield* Ref.make<ServerSettings>(
          deepMerge(DEFAULT_SERVER_SETTINGS, overrides),
        );
        const changesPubSub = yield* PubSub.unbounded<ServerSettings>();
        const revisionRef = yield* Ref.make(0);
        const emitChange = (settings: ServerSettings) =>
          PubSub.publish(changesPubSub, settings).pipe(Effect.asVoid);
        const getSettings = Ref.get(currentSettingsRef).pipe(
          Effect.map(resolveTextGenerationProvider),
        );
        const updateSettings = (patch: ServerSettingsPatch) =>
          Ref.get(currentSettingsRef).pipe(
            Effect.flatMap((currentSettings) =>
              normalizeSettings("<memory>", currentSettings, patch),
            ),
            Effect.tap((nextSettings) => Ref.set(currentSettingsRef, nextSettings)),
            Effect.tap(() => Ref.update(revisionRef, (revision) => revision + 1)),
            Effect.tap(emitChange),
            Effect.map(resolveTextGenerationProvider),
          );

        return {
          start: Effect.void,
          ready: Effect.void,
          getSettings,
          getSettingsView: getSettings.pipe(Effect.map(toServerSettingsView)),
          getSnapshot: Effect.all({
            revision: Ref.get(revisionRef),
            settings: getSettings,
          }).pipe(
            Effect.map(({ revision, settings }) => ({
              revision,
              migrationVersion: SERVER_SETTINGS_MIGRATION_VERSION,
              settings,
            })),
          ),
          updateSettings,
          updateSettingsView: (patch) =>
            updateSettings(patch).pipe(Effect.map(toServerSettingsView)),
          get streamChanges() {
            return Stream.fromPubSub(changesPubSub).pipe(Stream.map(resolveTextGenerationProvider));
          },
          get streamViews() {
            return Stream.fromPubSub(changesPubSub).pipe(
              Stream.map(resolveTextGenerationProvider),
              Stream.map(toServerSettingsView),
            );
          },
        } satisfies ServerSettingsShape;
      }),
    );
}

const PROVIDER_ORDER: readonly ProviderWithDefaultModel[] = [...API_PROVIDER_KINDS];

function resolveTextGenerationProvider(settings: ServerSettings): ServerSettings {
  const selection = settings.textGenerationModelSelection;
  if (settings.providers[selection.provider].enabled) {
    return settings;
  }

  const fallback = PROVIDER_ORDER.find((provider) => settings.providers[provider].enabled);
  if (!fallback) {
    return settings;
  }

  return {
    ...settings,
    textGenerationModelSelection: {
      provider: fallback,
      model: DEFAULT_MODEL_BY_PROVIDER[fallback],
    } as ModelSelection,
  };
}

function normalizeSettings(
  settingsPath: string,
  current: ServerSettings,
  patch: ServerSettingsPatch,
): Effect.Effect<ServerSettings, ServerSettingsError> {
  return Schema.decodeUnknownEffect(ServerSettings)(applyServerSettingsPatch(current, patch)).pipe(
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          detail: `failed to normalize server settings: ${SchemaIssue.makeFormatterDefault()(cause.issue)}`,
          cause,
        }),
    ),
  );
}

function readLegacyProviderPasswords(_raw: string): ReadonlyMap<string, string> {
  return new Map();
}

function omitProviderPasswords(patch: ServerSettingsPatch): ServerSettingsPatch {
  if (!patch.providers) return patch;
  // API providers may carry an apiKey. The secret store holds the real values, so never
  // persist them inside settings.json.
  const providers = {} as NonNullable<ServerSettingsPatch["providers"]>;
  for (const [name, providerSettings] of Object.entries(patch.providers)) {
    if (!providerSettings) continue;
    const { apiKey: _apiKey, ...rest } = providerSettings as {
      apiKey?: unknown;
    };
    Object.defineProperty(providers, name, {
      value: rest,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { ...patch, providers };
}

function decodeSettingsFromJson(settingsPath: string, raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const envelope =
      parsed !== null && typeof parsed === "object" && "settings" in parsed
        ? (parsed as { revision?: unknown; migrationVersion?: unknown; settings: unknown })
        : null;
    const decoded = Schema.decodeUnknownExit(ServerSettings)(envelope?.settings ?? parsed);
    if (decoded._tag === "Failure") {
      return { _tag: "Failure" as const, error: Cause.pretty(decoded.cause) };
    }
    return {
      _tag: "Success" as const,
      value: decoded.value,
      revision:
        envelope && Number.isSafeInteger(envelope.revision) && Number(envelope.revision) >= 0
          ? Number(envelope.revision)
          : 0,
      migrationVersion:
        envelope && Number.isSafeInteger(envelope.migrationVersion)
          ? Number(envelope.migrationVersion)
          : 0,
      legacyFormat: envelope === null,
    };
  } catch (cause) {
    const error = new ServerSettingsError({
      settingsPath,
      detail: "failed to parse settings JSON",
      cause,
    });
    return { _tag: "Failure" as const, error: error.message };
  }
}

const makeServerSettings = Effect.gen(function* () {
  const { settingsPath } = yield* ServerConfig;
  const providerCredentials = yield* ProviderCredentials;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const writeSemaphore = yield* Semaphore.make(1);
  const changesPubSub = yield* PubSub.unbounded<ServerSettings>();
  const settingsRef = yield* Ref.make<ServerSettings>(DEFAULT_SERVER_SETTINGS);
  const revisionRef = yield* Ref.make(0);
  const startedRef = yield* Ref.make(false);
  const startedDeferred = yield* Deferred.make<void, ServerSettingsError>();

  const emitChange = (settings: ServerSettings) =>
    PubSub.publish(changesPubSub, settings).pipe(Effect.asVoid);

  const withCredentialState = (settings: ServerSettings) =>
    Effect.all(
      API_PROVIDER_KINDS.map((provider) =>
        providerCredentials
          .isApiKeyConfigured(provider)
          .pipe(Effect.map((isConfigured) => [provider, isConfigured] as const)),
      ),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((entries) => {
        const configured = new Map(entries);
        return {
          ...settings,
          providers: {
            ...settings.providers,
            ...Object.fromEntries(
              API_PROVIDER_KINDS.map((provider) => [
                provider,
                {
                  ...settings.providers[provider],
                  apiKeyConfigured: configured.get(provider) ?? false,
                },
              ]),
            ),
          } satisfies ServerSettings["providers"],
        };
      }),
      Effect.mapError(
        (cause) =>
          new ServerSettingsError({
            settingsPath,
            detail: "failed to read provider credential state",
            cause,
          }),
      ),
    );

  const loadSettingsFromDisk = Effect.gen(function* () {
    const exists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError(
        (cause) =>
          new ServerSettingsError({
            settingsPath,
            detail: "failed to check settings file existence",
            cause,
          }),
      ),
    );
    if (!exists) {
      return {
        settings: yield* withCredentialState(DEFAULT_SERVER_SETTINGS),
        revision: 0,
        migrated: false,
      };
    }

    const raw = yield* fs.readFileString(settingsPath).pipe(
      Effect.mapError(
        (cause) =>
          new ServerSettingsError({
            settingsPath,
            detail: "failed to read settings file",
            cause,
          }),
      ),
    );
    const decoded = decodeSettingsFromJson(settingsPath, raw);
    if (decoded._tag === "Failure") {
      const quarantinePath = `${settingsPath}.invalid-${Date.now()}`;
      yield* fs.rename(settingsPath, quarantinePath).pipe(Effect.catch(() => Effect.void));
      yield* Effect.logWarning("quarantined invalid settings.json, using defaults", {
        path: settingsPath,
        quarantinePath,
        error: decoded.error,
      });
      return {
        settings: yield* withCredentialState(DEFAULT_SERVER_SETTINGS),
        revision: 0,
        migrated: false,
      };
    }
    const _legacyPasswords = readLegacyProviderPasswords(raw);
    return {
      settings: yield* withCredentialState(
        migrateSettings(decoded.value, decoded.migrationVersion),
      ),
      revision: decoded.revision,
      migrated:
        decoded.legacyFormat || decoded.migrationVersion !== SERVER_SETTINGS_MIGRATION_VERSION,
    };
  });

  const writeSettingsAtomically = (snapshot: ServerSettingsSnapshot) => {
    return writeFileStringAtomically({
      filePath: settingsPath,
      contents: `${JSON.stringify(snapshot, null, 2)}\n`,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ServerSettingsError({
            settingsPath,
            detail: "failed to write settings file",
            cause,
          }),
      ),
    );
  };

  const start = Effect.gen(function* () {
    const shouldStart = yield* Ref.modify(startedRef, (started) => [!started, true]);
    if (!shouldStart) {
      return yield* Deferred.await(startedDeferred);
    }

    const startup = Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(settingsPath), { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new ServerSettingsError({
              settingsPath,
              detail: "failed to prepare settings directory",
              cause,
            }),
        ),
      );
      const loaded = yield* loadSettingsFromDisk;
      if (loaded.migrated) {
        loaded.revision += 1;
        yield* writeSettingsAtomically({
          revision: loaded.revision,
          migrationVersion: SERVER_SETTINGS_MIGRATION_VERSION,
          settings: loaded.settings,
        });
      }
      yield* Ref.set(settingsRef, loaded.settings);
      yield* Ref.set(revisionRef, loaded.revision);
    });

    const startupExit = yield* Effect.exit(startup);
    if (startupExit._tag === "Failure") {
      yield* Deferred.failCause(startedDeferred, startupExit.cause).pipe(Effect.orDie);
      return yield* Effect.failCause(startupExit.cause);
    }

    yield* Deferred.succeed(startedDeferred, undefined).pipe(Effect.orDie);
  });

  const getSettings = Ref.get(settingsRef).pipe(Effect.map(resolveTextGenerationProvider));
  const updateSettings = (patch: ServerSettingsPatch) =>
    writeSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const disk = yield* loadSettingsFromDisk;
        const current = disk.settings;
        for (const provider of API_PROVIDER_KINDS) {
          const apiKey = patch.providers?.[provider]?.apiKey;
          if (apiKey !== undefined) {
            yield* providerCredentials.replaceApiKey(provider, apiKey).pipe(
              Effect.mapError(
                (cause) =>
                  new ServerSettingsError({
                    settingsPath,
                    detail: `failed to update ${provider} API key`,
                    cause,
                  }),
              ),
            );
          }
        }
        const normalized = yield* normalizeSettings(
          settingsPath,
          current,
          omitProviderPasswords(patch),
        );
        const next = yield* withCredentialState(normalized);
        const nextRevision = Math.max(disk.revision, yield* Ref.get(revisionRef)) + 1;
        yield* writeSettingsAtomically({
          revision: nextRevision,
          migrationVersion: SERVER_SETTINGS_MIGRATION_VERSION,
          settings: next,
        });
        yield* Ref.set(settingsRef, next);
        yield* Ref.set(revisionRef, nextRevision);
        yield* emitChange(next);
        return resolveTextGenerationProvider(next);
      }),
    );

  return {
    start,
    ready: Deferred.await(startedDeferred),
    getSettings,
    getSettingsView: getSettings.pipe(Effect.map(toServerSettingsView)),
    getSnapshot: Effect.all({ revision: Ref.get(revisionRef), settings: getSettings }).pipe(
      Effect.map(({ revision, settings }) => ({
        revision,
        migrationVersion: SERVER_SETTINGS_MIGRATION_VERSION,
        settings,
      })),
    ),
    updateSettings,
    updateSettingsView: (patch) => updateSettings(patch).pipe(Effect.map(toServerSettingsView)),
    get streamChanges() {
      return Stream.fromPubSub(changesPubSub).pipe(Stream.map(resolveTextGenerationProvider));
    },
    get streamViews() {
      return Stream.fromPubSub(changesPubSub).pipe(
        Stream.map(resolveTextGenerationProvider),
        Stream.map(toServerSettingsView),
      );
    },
  } satisfies ServerSettingsShape;
});

export const ServerSettingsLive = Layer.effect(ServerSettingsService, makeServerSettings).pipe(
  Layer.provide(ProviderCredentialsLive),
);
