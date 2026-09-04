// FILE: useDyadProviderSettings.ts
// Purpose: Harness-socket client for Dyad provider keys (settings route).
// Request/response over provider_settings_* messages matched by requestId;
// keys never come back (configured flags only).

import { useCallback, useEffect, useRef, useState } from "react";
import type { HarnessEvent } from "@caide/contracts";
import { connectHarnessWs, makeHarnessUrl, type HarnessWsHandle } from "~/harnessWs";

export interface DyadProviderStatus {
  id: string;
  configured: boolean;
  hasBaseUrl: boolean;
}

export interface DyadProvidersState {
  providers: DyadProviderStatus[];
  defaultProviderId?: string;
  defaultModelId?: string;
  tests: Record<string, { ok: boolean; message: string }>;
  connected: boolean;
}

let requestCounter = 0;

const KNOWN_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "deepseek",
  "groq",
  "xai",
  "minimax",
  "opencodeZen",
  "opencodeGo",
  "opencode-zen",
  "ollama",
  "lmstudio",
  "mistral",
  "together",
  "cohere",
  "fireworks",
  "azure",
  "vertex",
  "bedrock",
  "custom",
] as const;

export function knownDyadProviders(): readonly string[] {
  return KNOWN_PROVIDERS;
}

export function useDyadProviderSettings(): DyadProvidersState & {
  save: (providerId: string, entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string }) => void;
  saveDefaults: (providerId?: string, modelId?: string) => void;
  test: (providerId: string) => void;
  refresh: () => void;
} {
  const [state, setState] = useState<DyadProvidersState>({
    providers: [],
    tests: {},
    connected: false,
  });
  const handleRef = useRef<HarnessWsHandle | null>(null);
  const pendingRef = useRef(new Map<string, (event: HarnessEvent) => void>());

  useEffect(() => {
    let handle: HarnessWsHandle | null = null;
    try {
      handle = connectHarnessWs({
        url: makeHarnessUrl(null),
        sessionId: "settings",
        onEvent: (event) => {
          if (event.type !== "provider_settings_state") return;
          const e = event as unknown as {
            requestId?: string;
            providers: DyadProviderStatus[];
            defaultProviderId?: string;
            defaultModelId?: string;
            tests?: Record<string, { ok: boolean; message: string }>;
          };
          setState((prev) => ({
            ...prev,
            connected: true,
            providers: e.providers,
            defaultProviderId: e.defaultProviderId,
            defaultModelId: e.defaultModelId,
            tests: { ...prev.tests, ...(e.tests ?? {}) },
          }));
          if (e.requestId) pendingRef.current.get(e.requestId)?.(event);
        },
      });
    } catch {
      handle = null;
    }
    handleRef.current = handle;
    setState((prev) => ({ ...prev, connected: handle !== null }));
    handle?.send({ type: "provider_settings_get", sessionId: "settings", requestId: `init-${Date.now()}` });
    return () => {
      try {
        handle?.disconnect();
      } catch {
        // already closed
      }
      handleRef.current = null;
    };
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    handleRef.current?.send(message);
  }, []);

  const refresh = useCallback(() => {
    send({ type: "provider_settings_get", sessionId: "settings", requestId: `get-${++requestCounter}` });
  }, [send]);

  const save = useCallback(
    (providerId: string, entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string }) => {
      send({
        type: "provider_settings_set",
        sessionId: "settings",
        requestId: `set-${++requestCounter}`,
        provider: { id: providerId },
        providerEntry: entry,
      });
    },
    [send],
  );

  const test = useCallback(
    (providerId: string) => {
      send({
        type: "provider_settings_test",
        sessionId: "settings",
        requestId: `test-${++requestCounter}`,
        provider: { id: providerId },
      });
    },
    [send],
  );

  const saveDefaults = useCallback(
    (providerId?: string, modelId?: string) => {
      send({
        type: "provider_settings_set",
        sessionId: "settings",
        requestId: `defaults-${++requestCounter}`,
        provider: { id: "auto" },
        providerEntry: {},
        defaults: { providerId: providerId ?? "", modelId: modelId ?? "" },
      });
    },
    [send],
  );

  return { ...state, save, saveDefaults, test, refresh };
}
