import * as NodeServices from "@effect/platform-node/NodeServices";
import { dirname } from "node:path";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL, DEFAULT_MODEL_BY_PROVIDER } from "@caide/contracts";
import { Effect, FileSystem, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ServerConfig } from "./config";
import { ServerSettingsLive, ServerSettingsService } from "./serverSettings";

const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "caide-settings-test-",
}).pipe(Layer.provide(NodeServices.layer));
const makeTestLayer = Layer.merge(NodeServices.layer, serverConfigLayer);
const testLayer = Layer.merge(makeTestLayer, ServerSettingsLive.pipe(Layer.provide(makeTestLayer)));

const runWithSettings = <A, E>(
  effect: Effect.Effect<A, E, ServerSettingsService | ServerConfig | FileSystem.FileSystem>,
) => Effect.runPromise(effect.pipe(Effect.provide(testLayer)) as Effect.Effect<A, E, never>);

describe("ServerSettingsService", () => {
  it("loads defaults when settings file does not exist", async () => {
    const settings = await runWithSettings(
      Effect.gen(function* () {
        const service = yield* ServerSettingsService;
        yield* service.start;
        return yield* service.getSettings;
      }),
    );

    expect((settings.providers as any).codex?.binaryPath).toBe("openai");
    expect((settings.providers as any).grok?.binaryPath).toBe("openai");
    expect(settings.defaultThreadEnvMode).toBe("local");
    expect(settings.enableProviderUpdateChecks).toBe(true);
  });

  it("persists updates and reloads them", async () => {
    const result = await runWithSettings(
      Effect.gen(function* () {
        const service = yield* ServerSettingsService;
        const { settingsPath } = yield* ServerConfig;
        const fs = yield* FileSystem.FileSystem;
        yield* service.start;

        const updated = yield* service.updateSettings({
          enableAssistantStreaming: true,
          enableProviderUpdateChecks: false,
          providers: {
            engine: {
              binaryPath: "/usr/local/bin/engine",
              customModels: ["gpt-custom"],
            },
          },
        });
        const raw = yield* fs.readFileString(settingsPath);
        return { updated, parsed: JSON.parse(raw) as unknown };
      }),
    );

    expect(result.updated.enableAssistantStreaming).toBe(true);
    expect(result.updated.enableProviderUpdateChecks).toBe(false);
    expect(result.updated.providers.engine?.binaryPath).toBe("/usr/local/bin/engine");
    expect(result.parsed).toMatchObject({
      revision: 1,
      migrationVersion: 2,
      settings: {
        enableAssistantStreaming: true,
        enableProviderUpdateChecks: false,
        providers: {
          engine: {
            binaryPath: "/usr/local/bin/engine",
            customModels: ["gpt-custom"],
          },
        },
      },
    });
  });

  it("migrates the previous Git writing default to GPT-5.6 Luna", async () => {
    const result = await runWithSettings(
      Effect.gen(function* () {
        const service = yield* ServerSettingsService;
        const { settingsPath } = yield* ServerConfig;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(dirname(settingsPath), { recursive: true });
        yield* fs.writeFileString(
          settingsPath,
          JSON.stringify({
            revision: 7,
            migrationVersion: 1,
            settings: {
              textGenerationModelSelection: {
                provider: "openai",
                model: "gpt-5.4-mini",
              },
            },
          }),
        );

        yield* service.start;
        const settings = yield* service.getSettings;
        const persisted = JSON.parse(yield* fs.readFileString(settingsPath)) as {
          migrationVersion: number;
          settings: { textGenerationModelSelection: { model: string } };
        };
        return { settings, persisted };
      }),
    );

    expect(result.settings.textGenerationModelSelection.model).toBe(
      DEFAULT_GIT_TEXT_GENERATION_MODEL,
    );
    expect(result.persisted.migrationVersion).toBe(2);
    expect(result.persisted.settings.textGenerationModelSelection.model).toBe(
      DEFAULT_GIT_TEXT_GENERATION_MODEL,
    );
  });

  it("keeps provider API keys server-only and returns configured flags to clients", async () => {
    const result = await runWithSettings(
      Effect.gen(function* () {
        const service = yield* ServerSettingsService;
        const { settingsPath } = yield* ServerConfig;
        const fs = yield* FileSystem.FileSystem;
        yield* service.start;

        const view = yield* service.updateSettingsView({
          providers: {
            groq: {
              apiKey: "gsk-groq-test-key",
            },
          },
        });
        const internal = yield* service.getSettings;
        const persisted = yield* fs.readFileString(settingsPath);
        return { view, internal, persisted };
      }),
    );

    expect(result.internal.providers.groq.apiKeyConfigured).toBe(true);
    expect(result.view.providers.groq).toMatchObject({ apiKeyConfigured: true });
    expect(JSON.stringify(result.internal)).not.toContain("gsk-groq-test-key");
    expect(JSON.stringify(result.view)).not.toContain("gsk-groq-test-key");
    expect(JSON.stringify(result.view)).not.toContain('"apiKey"');
    expect(result.persisted).not.toContain("gsk-groq-test-key");
  });

  it("resolves text generation selection away from disabled providers", async () => {
    const settings = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ServerSettingsService;
        return yield* service.getSettings;
      }).pipe(
        Effect.provide(
          ServerSettingsService.layerTest({
            textGenerationModelSelection: {
              provider: "groq",
              model: DEFAULT_MODEL_BY_PROVIDER.groq,
            },
            providers: {
              groq: { enabled: false },
            },
          }),
        ),
      ),
    );

    expect(settings.textGenerationModelSelection.provider).toBe("groq");
    expect(settings.textGenerationModelSelection.model).toBe(DEFAULT_MODEL_BY_PROVIDER.groq);
  });
});
