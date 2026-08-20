import { DEFAULT_SERVER_SETTINGS, ProviderSessionStartInput } from "@caide/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { providerStartOptionsFromServerSettings } from "./serverSettings";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);

describe("providerStartOptionsFromServerSettings", () => {
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
        provider: "codex",
        providerOptions,
        runtimeMode: "full-access",
      }),
    ).not.toThrow();
    expect(providerOptions.codex).toEqual({});
    expect(providerOptions.claudeAgent).toEqual({});
    expect(providerOptions.cursor).toEqual({});
    expect(providerOptions.antigravity).toEqual({});
    expect(providerOptions.grok).toEqual({});
    expect(providerOptions.droid).toEqual({});
    expect(providerOptions.kilo).toEqual({});
    expect(providerOptions.opencode).toEqual({ experimentalWebSockets: false });
    expect(providerOptions.pi).toEqual({});
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

    expect(providerOptions.codex).toEqual({
      binaryPath: "/custom/bin/codex",
      homePath: "/custom/codex-home",
    });
    expect(providerOptions.opencode).toEqual({
      binaryPath: "/custom/bin/opencode",
      serverUrl: "http://127.0.0.1:4096",
      experimentalWebSockets: true,
    });
  });
});
