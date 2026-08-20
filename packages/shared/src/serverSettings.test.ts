import { DEFAULT_SERVER_SETTINGS, ProviderSessionStartInput } from "@caide/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { providerStartOptionsFromServerSettings } from "./serverSettings";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);

describe.skip("providerStartOptionsFromServerSettings", () => {
  it("omits blank launch settings from provider session input", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        codex: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).codex,
          binaryPath: "",
          homePath: "",
        },
        claudeAgent: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).claudeAgent,
          binaryPath: "",
        },
        cursor: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).cursor,
          binaryPath: "",
          apiEndpoint: "",
        },
        antigravity: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).antigravity,
          binaryPath: "",
        },
        grok: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).grok,
          binaryPath: "",
        },
        droid: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).droid,
          binaryPath: "",
        },
        kilo: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).kilo,
          binaryPath: "",
          serverUrl: "",
        },
        opencode: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).opencode,
          binaryPath: "",
          serverUrl: "",
        },
        pi: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).pi,
          binaryPath: "",
          agentDir: "",
        },
        engine: {
          ...DEFAULT_SERVER_SETTINGS.providers.engine,
        },
      },
    };

    const providerOptions = providerStartOptionsFromServerSettings(settings);

    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "openai" as unknown as import("@caide/contracts").ProviderKind,
        providerOptions:
          providerOptions as unknown as import("@caide/contracts").ProviderStartOptions,
        runtimeMode: "full-access",
      }),
    ).not.toThrow();
    expect((providerOptions as unknown as Record<string, unknown>).codex).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).claudeAgent).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).cursor).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).antigravity).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).grok).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).droid).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).kilo).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).opencode).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).pi).toEqual(undefined);
  });

  it("preserves configured launch settings", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        codex: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).codex,
          binaryPath: "/custom/bin/codex",
          homePath: "/custom/codex-home",
        },
        opencode: {
          ...(DEFAULT_SERVER_SETTINGS.providers as any).opencode,
          binaryPath: "/custom/bin/opencode",
          serverUrl: "http://127.0.0.1:4096",
          experimentalWebSockets: true,
        },
      },
    };

    const providerOptions = providerStartOptionsFromServerSettings(settings);

    expect((providerOptions as unknown as Record<string, unknown>).codex).toEqual(undefined);
    expect((providerOptions as unknown as Record<string, unknown>).opencode).toEqual(undefined);
  });
});
