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
  keyless: boolean;
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
  test: (
    providerId: string,
    candidate?: { apiKey?: string; apiBaseUrl?: string },
  ) => Promise<{ ok: boolean; message: string }>;
  refresh: () => void;
} {
  const [state, setState] = useState<DyadProvidersState>({
    providers: [],
    tests: {},
    connected: false,
  });
  const handleRef = useRef<HarnessWsHandle | null>(null);
  const pendingRef = useRef(new Map<string, (event: HarnessEvent) => void>());
  // Last applied provider_settings_state / last state request, for staleness
  // detection. A socket can end up half-working (sends arrive, broadcasts
  // never do — e.g. a subscription lost across a server restart): without
  // this the panel sits on empty state with "Harness connected" forever.
  const lastStateAtRef = useRef(0);
  const lastGetAtRef = useRef(0);
  const staleCyclesRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armWatchdogRef = useRef(() => {});

  const clearWatchdog = () => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  useEffect(() => {
    let handle: HarnessWsHandle | null = null;
    let disposed = false;
    const openSocket = () => {
      if (disposed) return;
      try {
        handle = connectHarnessWs({
          // Re-resolved on every (re)connect: the server port is dynamic and
          // a cached URL can point at a previous incarnation.
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
            lastStateAtRef.current = Date.now();
            staleCyclesRef.current = 0;
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
          // Request state on every (re)connect: sending immediately after
          // connectHarnessWs returns races the socket and is silently dropped,
          // leaving the panel permanently empty ("No connected providers").
          // requestState subscribes first — broadcasts only reach
          // subscribed sessions.
          onOpen: () => {
            requestState("init");
          },
        });
      } catch {
        handle = null;
      }
      handleRef.current = handle;
      setState((prev) => ({ ...prev, connected: handle !== null }));
    };
    const requestState = (reason: string) => {
      lastGetAtRef.current = Date.now();
      handleRef.current?.send({ type: "subscribe", sessionId: "settings" });
      handleRef.current?.send({
        type: "provider_settings_get",
        sessionId: "settings",
        requestId: `${reason}-${Date.now()}`,
      });
      armWatchdog();
    };
    const armWatchdog = () => {
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (disposed) return;
        // No state since the request: the socket is half-working or the URL
        // is stale. Reconnect (fresh URL + resubscribe) a couple of times,
        // then honestly report offline so the panel stops claiming "Harness
        // connected" with empty data.
        if (lastStateAtRef.current < lastGetAtRef.current) {
          if (staleCyclesRef.current < 2) {
            staleCyclesRef.current += 1;
            try {
              handle?.disconnect();
            } catch {
              // already closed
            }
            handle = null;
            handleRef.current = null;
            openSocket();
            // openSocket's onOpen re-requests state and re-arms the watchdog.
          } else {
            setState((prev) => ({ ...prev, connected: false }));
          }
        }
      }, 6000);
    };
    armWatchdogRef.current = armWatchdog;
    openSocket();
    return () => {
      disposed = true;
      clearWatchdog();
      try {
        handle?.disconnect();
      } catch {
        // already closed
      }
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    handleRef.current?.send(message);
  }, []);

  const refresh = useCallback(() => {
    // Subscribe-first: broadcasts only reach subscribed sessions, and a
    // subscription can be lost while sends keep working (e.g. across a
    // server restart), leaving the panel permanently empty.
    send({ type: "subscribe", sessionId: "settings" });
    send({ type: "provider_settings_get", sessionId: "settings", requestId: `get-${++requestCounter}` });
    lastGetAtRef.current = Date.now();
    // Arm the stale watchdog so a half-working socket heals itself instead
    // of leaving badges stuck on "Needs key".
    armWatchdogRef.current();
  }, [send]);

  const save = useCallback(
    (providerId: string, entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string }) => {
      send({ type: "subscribe", sessionId: "settings" });
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
    (
      providerId: string,
      candidate?: { apiKey?: string; apiBaseUrl?: string },
    ): Promise<{ ok: boolean; message: string }> => {
      return new Promise((resolve) => {
        const reqId = `test-${++requestCounter}`;
        const timer = setTimeout(() => {
          pendingRef.current.delete(reqId);
          resolve({ ok: false, message: "Connection test timed out after 15s." });
        }, 15_000);

        pendingRef.current.set(reqId, (event) => {
          clearTimeout(timer);
          pendingRef.current.delete(reqId);
          const e = event as unknown as {
            tests?: Record<string, { ok: boolean; message: string }>;
          };
          const res = e.tests?.[providerId] ?? { ok: true, message: "Provider check complete." };
          resolve(res);
        });

        // Subscribe-first (see refresh): the test answer arrives as a
        // broadcast, which requires an active subscription.
        send({ type: "subscribe", sessionId: "settings" });
        send({
          type: "provider_settings_test",
          sessionId: "settings",
          requestId: reqId,
          provider: { id: providerId },
          ...(candidate ? { providerEntry: candidate } : {}),
        });
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
