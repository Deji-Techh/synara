// FILE: useDyadProviderSettings.test.ts
// Purpose: Covers the settings socket handshake (subscribe-first ordering),
// state application, and the stale-socket watchdog (reconnect with a fresh
// URL, honest offline flag) that keeps provider badges from sticking on
// "Needs key" when broadcasts stop arriving.

import { beforeEach, describe, expect, it, vi } from "vitest";

const reactHarness = vi.hoisted(() => {
  interface HookSlot {
    value?: unknown;
    deps?: readonly unknown[];
    cleanup?: () => void;
  }

  let slots: HookSlot[] = [];
  let cursor = 0;

  const nextSlot = () => {
    const index = cursor;
    cursor += 1;
    slots[index] ??= {};
    return slots[index]!;
  };
  const depsEqual = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));

  return {
    beginRender() {
      cursor = 0;
    },
    reset() {
      slots = [];
      cursor = 0;
    },
    unmount() {
      for (const slot of slots.toReversed()) {
        slot.cleanup?.();
      }
      slots = [];
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const slot = nextSlot();
      if (depsEqual(slot.deps, deps)) return;
      slot.cleanup?.();
      slot.deps = deps;
      const cleanup = effect();
      if (cleanup) slot.cleanup = cleanup;
      else delete slot.cleanup;
    },
    useRef<T>(initialValue: T) {
      const slot = nextSlot();
      slot.value ??= { current: initialValue };
      return slot.value as { current: T };
    },
    useState<T>(initialValue: T) {
      const slot = nextSlot();
      if (!("value" in slot)) slot.value = initialValue;
      const setValue = (next: T | ((current: T) => T)) => {
        slot.value =
          typeof next === "function" ? (next as (current: T) => T)(slot.value as T) : next;
      };
      return [slot.value as T, setValue] as const;
    },
    readState(): unknown {
      return slots[0]?.value;
    },
  };
});

vi.mock("react", () => ({
  useEffect: reactHarness.useEffect,
  useRef: reactHarness.useRef,
  useState: reactHarness.useState,
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
}));

interface FakeSocket {
  sent: unknown[];
  options: { onEvent: (e: unknown) => void; onOpen?: () => void };
  disconnect: () => void;
  open: () => void;
  receive: (e: unknown) => void;
}

const sockets: FakeSocket[] = [];
vi.mock("../harnessWs", () => ({
  makeHarnessUrl: () => "ws://test/harness",
  connectHarnessWs: (options: FakeSocket["options"]) => {
    const socket: FakeSocket = {
      sent: [],
      options,
      disconnect: vi.fn(),
      open: () => options.onOpen?.(),
      receive: (e: unknown) => options.onEvent(e),
    };
    sockets.push(socket);
    return {
      disconnect: socket.disconnect,
      send: (message: unknown) => {
        socket.sent.push(message);
      },
    };
  },
}));

import { useDyadProviderSettings } from "./useDyadProviderSettings";

const stateEvent = (overrides: Record<string, unknown> = {}) => ({
  type: "provider_settings_state",
  sessionId: "settings",
  providers: [
    { id: "groq", configured: true, hasBaseUrl: false, keyless: false },
    { id: "openai", configured: false, hasBaseUrl: false, keyless: false },
  ],
  ...overrides,
});

function mount() {
  reactHarness.reset();
  reactHarness.beginRender();
  const api = useDyadProviderSettings();
  return api;
}

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  reactHarness.reset();
});

describe("useDyadProviderSettings", () => {
  it("sends subscribe before the initial state request on open", () => {
    mount();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    const types = sockets[0]!.sent.map((m) => (m as { type: string }).type);
    expect(types[0]).toBe("subscribe");
    expect(types[1]).toBe("provider_settings_get");
  });

  it("applies incoming provider state and marks connected", () => {
    const api = mount();
    sockets[0]!.open();
    sockets[0]!.receive(stateEvent());
    expect(api).toBeDefined();
    const state = reactHarness.readState() as {
      providers: Array<{ id: string; configured: boolean }>;
      connected: boolean;
    };
    expect(state.connected).toBe(true);
    expect(state.providers.find((p) => p.id === "groq")?.configured).toBe(true);
  });

  it("sends subscribe first on refresh/save/test", () => {
    const api = mount();
    sockets[0]!.open();
    sockets[0]!.sent.length = 0;
    api.refresh();
    api.save("groq", { apiKey: "k" });
    const types = sockets[0]!.sent.map((m) => (m as { type: string }).type);
    expect(types).toEqual([
      "subscribe",
      "provider_settings_get",
      "subscribe",
      "provider_settings_set",
    ]);
  });

  it("reconnects with a fresh socket when state never arrives, then reports offline", () => {
    mount();
    sockets[0]!.open();
    expect(sockets).toHaveLength(1);
    // First watchdog cycle: reconnect.
    vi.advanceTimersByTime(6000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    // Second cycle: reconnect again.
    vi.advanceTimersByTime(6000);
    expect(sockets).toHaveLength(3);
    sockets[2]!.open();
    // Third cycle: honestly report offline instead of claiming connected.
    vi.advanceTimersByTime(6000);
    const state = reactHarness.readState() as { connected: boolean };
    expect(state.connected).toBe(false);
    expect(sockets).toHaveLength(3);
  });

  it("seeds providers from local bridge presence when socket state is absent", async () => {
    (globalThis as unknown as { window?: unknown }).window = {
      desktopBridge: {
        getProviderKeyPresence: async () => [
          { id: "groq", configured: true, hasBaseUrl: false, keyless: false },
        ],
      },
    };
    try {
      mount();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      reactHarness.beginRender();
      const rerendered = useDyadProviderSettings();
      const provided = (
        rerendered as unknown as { providers: Array<{ id: string; configured: boolean }> }
      ).providers;
      expect(provided.find((p) => p.id === "groq")?.configured).toBe(true);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  it("prefers live socket state over local bridge presence", async () => {
    (globalThis as unknown as { window?: unknown }).window = {
      desktopBridge: {
        getProviderKeyPresence: async () => [
          { id: "groq", configured: false, hasBaseUrl: false, keyless: false },
        ],
      },
    };
    try {
      mount();
      sockets[0]!.open();
      sockets[0]!.receive(stateEvent());
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      reactHarness.beginRender();
      const rerendered = useDyadProviderSettings();
      const provided = (
        rerendered as unknown as { providers: Array<{ id: string; configured: boolean }> }
      ).providers;
      // Socket says groq configured (stateEvent) even though local says not.
      expect(provided.find((p) => p.id === "groq")?.configured).toBe(true);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  it("stops the watchdog once state arrives", () => {
    mount();
    sockets[0]!.open();
    sockets[0]!.receive(stateEvent());
    vi.advanceTimersByTime(30000);
    // No reconnect storms after healthy state.
    expect(sockets).toHaveLength(1);
    const state = reactHarness.readState() as { connected: boolean };
    expect(state.connected).toBe(true);
  });
});
