// FILE: providerUpdates.test.ts
// Purpose: Covers provider-update filtering shared by notifications and settings.
// Layer: Web utility tests
// Exports: Vitest suites for providerUpdates.ts

import type { ProviderKind, ServerProviderStatus, ServerSettings } from "@caide/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getNotifiableProviderUpdateStatuses,
  getVisibleProviderUpdateStatuses,
  isProviderLatestVersionKnowable,
  isProviderUpdateActive,
  providerUpdateNotificationKey,
  shouldOfferProviderUpdateAction,
  shouldPromptProviderUpdate,
  shouldShowProviderUpdateStatus,
  withProviderUpdateTimeout,
} from "./providerUpdates";

afterEach(() => {
  vi.useRealTimers();
});

function providerStatus(
  provider: ProviderKind,
  overrides: Partial<ServerProviderStatus> = {},
): ServerProviderStatus {
  return {
    provider,
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: "2026-06-10T10:00:00.000Z",
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: "npm install -g provider@latest",
      canUpdate: true,
      checkedAt: "2026-06-10T10:00:00.000Z",
      message: "Update available.",
    },
    ...overrides,
  };
}

function serverSettings(overrides: Partial<ServerSettings["providers"]> = {}): ServerSettings {
  const provider = {
    enabled: true,
    binaryPath: "",
    customModels: [],
  };

  return {
    enableAssistantStreaming: false,
    enableProviderUpdateChecks: true,
    defaultThreadEnvMode: "local",
    addProjectBaseDirectory: "",
    textGenerationModelSelection: { provider: "openai", model: "gpt-5.4-mini" },
    providers: {
      codex: { ...provider, binaryPath: "openai", homePath: "" },
      claudeAgent: { ...provider, binaryPath: "claude", launchArgs: "" },
      cursor: { ...provider, binaryPath: "cursor-agent", apiEndpoint: "" },
      antigravity: { ...provider, binaryPath: "agy" },
      grok: { ...provider, binaryPath: "openai" },
      droid: { ...provider, binaryPath: "openai" },
      kilo: { ...provider, binaryPath: "openai", serverUrl: "", serverPasswordConfigured: false },
      opencode: {
        ...provider,
        binaryPath: "openai",
        serverUrl: "",
        serverPasswordConfigured: false,
        experimentalWebSockets: false,
      },
      pi: { ...provider, binaryPath: "openai", agentDir: "" },
      engine: {
        ...provider,
        binaryPath: "caide-engine",
        baseUrl: "",
        modelId: "",
        apiKeyConfigured: false,
        flutterSdkBin: "",
      },
      openai: { ...provider, baseUrl: "", apiKeyConfigured: false },
      anthropic: { ...provider, baseUrl: "", apiKeyConfigured: false },
      google: { ...provider, baseUrl: "", apiKeyConfigured: false },
      openrouter: { ...provider, baseUrl: "", apiKeyConfigured: false },
      ollama: { ...provider, baseUrl: "", apiKeyConfigured: false },
      deepseek: { ...provider, baseUrl: "", apiKeyConfigured: false },
      groq: { ...provider, baseUrl: "", apiKeyConfigured: false },
      mistral: { ...provider, baseUrl: "", apiKeyConfigured: false },
      together: { ...provider, baseUrl: "", apiKeyConfigured: false },
      cohere: { ...provider, baseUrl: "", apiKeyConfigured: false },
      xai: { ...provider, baseUrl: "", apiKeyConfigured: false },
      fireworks: { ...provider, baseUrl: "", apiKeyConfigured: false },
      opencodeZen: { ...provider, baseUrl: "", apiKeyConfigured: false },
      ...overrides,
    },
    skills: { disabled: [] },
  };
}

describe("getVisibleProviderUpdateStatuses", () => {
  it("excludes providers hidden from Caide so unchecked providers do not nag", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("openai"), providerStatus("openai")],
      hiddenProviders: ["openai"],
      serverSettings: serverSettings(),
    });

    expect(result.map((provider) => provider.provider)).toEqual(["openai"]);
  });

  it("excludes server-disabled providers", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("openai"), providerStatus("openai")],
      serverSettings: serverSettings({
        pi: { enabled: false, binaryPath: "openai", agentDir: "", customModels: [] },
      }),
    });

    expect(result.map((provider) => provider.provider)).toEqual(["openai"]);
  });

  it("waits for server settings before showing provider updates", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("openai")],
      serverSettings: null,
    });

    expect(result).toEqual([]);
  });

  it("excludes provider updates when automatic update checks are disabled", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("openai")],
      serverSettings: { ...serverSettings(), enableProviderUpdateChecks: false },
    });

    expect(result).toEqual([]);
  });

  it("can narrow notifications to one-click updates while settings keep manual updates visible", () => {
    const manualOnly = providerStatus("openai", {
      versionAdvisory: {
        status: "behind_latest",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        updateCommand: null,
        canUpdate: false,
        checkedAt: "2026-06-10T10:00:00.000Z",
        message: "Update available.",
      },
    });

    expect(
      getVisibleProviderUpdateStatuses({
        providers: [providerStatus("openai"), manualOnly],
        serverSettings: serverSettings(),
      }).map((provider) => provider.provider),
    ).toEqual(["openai", "openai"]);
    expect(
      getVisibleProviderUpdateStatuses({
        providers: [providerStatus("openai"), manualOnly],
        serverSettings: serverSettings(),
        oneClickOnly: true,
      }).map((provider) => provider.provider),
    ).toEqual(["openai"]);
  });
});

describe("getNotifiableProviderUpdateStatuses", () => {
  it("suppresses cached update advisories until a live version check completes", () => {
    const providers = [providerStatus("anthropic")];
    const settings = serverSettings();

    expect(
      getNotifiableProviderUpdateStatuses({
        providers,
        serverSettings: settings,
        liveVersionCheckCompleted: false,
      }),
    ).toEqual([]);
    expect(
      getNotifiableProviderUpdateStatuses({
        providers,
        serverSettings: settings,
        liveVersionCheckCompleted: true,
      }).map((provider) => provider.provider),
    ).toEqual(["anthropic"]);
  });

  it("keeps notifications limited to one-click updates after verification", () => {
    const manualOnly = providerStatus("anthropic", {
      versionAdvisory: {
        ...providerStatus("anthropic").versionAdvisory!,
        updateCommand: null,
        canUpdate: false,
      },
    });

    expect(
      getNotifiableProviderUpdateStatuses({
        providers: [manualOnly],
        serverSettings: serverSettings(),
        liveVersionCheckCompleted: true,
      }),
    ).toEqual([]);
  });
});

describe("providerUpdateNotificationKey", () => {
  it("keys by provider/version and ignores ordering", () => {
    const left = providerUpdateNotificationKey([
      providerStatus("openai", {
        versionAdvisory: {
          ...providerStatus("openai").versionAdvisory!,
          latestVersion: "2.0.0",
        },
      }),
      providerStatus("openai"),
    ]);
    const right = providerUpdateNotificationKey([
      providerStatus("openai"),
      providerStatus("openai", {
        versionAdvisory: {
          ...providerStatus("openai").versionAdvisory!,
          latestVersion: "2.0.0",
        },
      }),
    ]);

    expect(left).toBe(right);
  });
});

describe("shouldShowProviderUpdateStatus", () => {
  it("matches the list filter for hidden and server-disabled providers", () => {
    const codex = providerStatus("openai");
    const hiddenPi = providerStatus("openai");
    const settings = serverSettings({
      codex: { enabled: false, binaryPath: "openai", homePath: "", customModels: [] },
    });

    expect(
      shouldShowProviderUpdateStatus({
        provider: codex,
        hiddenProviderSet: new Set(),
        serverSettings: settings,
      }),
    ).toBe(false);
    expect(
      shouldShowProviderUpdateStatus({
        provider: hiddenPi,
        hiddenProviders: ["openai"],
        serverSettings: serverSettings(),
      }),
    ).toBe(false);
  });
});

describe("isProviderUpdateActive", () => {
  it("only treats queued and running provider updates as active", () => {
    const queuedState = {
      status: "queued",
      startedAt: null,
      finishedAt: null,
      message: null,
      output: null,
    } satisfies NonNullable<ServerProviderStatus["updateState"]>;
    const succeededState = {
      ...queuedState,
      status: "succeeded",
    } satisfies NonNullable<ServerProviderStatus["updateState"]>;

    expect(isProviderUpdateActive(providerStatus("openai", { updateState: queuedState }))).toBe(
      true,
    );
    expect(isProviderUpdateActive(providerStatus("openai", { updateState: succeededState }))).toBe(
      false,
    );
  });
});

describe("withProviderUpdateTimeout", () => {
  it("rejects a provider request that never settles", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const assertion = expect(
      withProviderUpdateTimeout({
        provider: "openai",
        request: pending,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("Kilo update timed out after 1 second");

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("clears its watchdog when the provider request finishes", async () => {
    vi.useFakeTimers();
    await expect(
      withProviderUpdateTimeout({
        provider: "google",
        request: Promise.resolve("updated"),
        timeoutMs: 1_000,
      }),
    ).resolves.toBe("updated");

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("shouldOfferProviderUpdateAction", () => {
  it("offers native AGY updates even when upstream latest-version metadata is unavailable", () => {
    expect(
      shouldOfferProviderUpdateAction(
        providerStatus("google", {
          versionAdvisory: {
            status: "unknown",
            currentVersion: "1.1.2",
            latestVersion: null,
            updateCommand: "agy update",
            canUpdate: true,
            checkedAt: "2026-07-15T14:00:00.000Z",
            message: null,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("shouldPromptProviderUpdate", () => {
  // Cursor and Antigravity self-update, so Caide has no registry to read a latest
  // version from and their advisory is pinned to "unknown" forever. Prompting on that
  // left a permanent "Update" badge on a fully up-to-date CLI.
  const selfManaged = providerStatus("openai", {
    version: "2026.07.09-c59fd9a",
    versionAdvisory: {
      status: "unknown",
      currentVersion: "2026.07.09-c59fd9a",
      latestVersion: null,
      latestVersionKnowable: false,
      updateCommand: "cursor-agent update",
      canUpdate: true,
      checkedAt: "2026-07-15T14:00:00.000Z",
      message: null,
    },
  });

  it("does not prompt when the latest version is unknowable", () => {
    expect(isProviderLatestVersionKnowable(selfManaged)).toBe(false);
    expect(shouldPromptProviderUpdate(selfManaged)).toBe(false);
    // The update itself stays reachable as a manual action.
    expect(shouldOfferProviderUpdateAction(selfManaged)).toBe(true);
  });

  it("still prompts when a lookup source exists but the latest version is missing", () => {
    const transient = providerStatus("google", {
      versionAdvisory: {
        status: "unknown",
        currentVersion: "1.1.2",
        latestVersion: null,
        latestVersionKnowable: true,
        updateCommand: "agy update",
        canUpdate: true,
        checkedAt: "2026-07-15T14:00:00.000Z",
        message: null,
      },
    });

    expect(shouldPromptProviderUpdate(transient)).toBe(true);
  });

  it("assumes a lookup source when an older server omits the flag", () => {
    const legacy = providerStatus("openai", {
      versionAdvisory: {
        status: "unknown",
        currentVersion: "1.1.2",
        latestVersion: null,
        updateCommand: "kilo update",
        canUpdate: true,
        checkedAt: "2026-07-15T14:00:00.000Z",
        message: null,
      },
    });

    expect(isProviderLatestVersionKnowable(legacy)).toBe(true);
    expect(shouldPromptProviderUpdate(legacy)).toBe(true);
  });

  it("keeps prompting for providers Caide can prove are behind", () => {
    expect(shouldPromptProviderUpdate(providerStatus("openai"))).toBe(true);
  });
});
