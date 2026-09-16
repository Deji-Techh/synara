// FILE: gateway.test.ts
// Purpose: M3h gate — gateway start/steer/cancel over a fake WS server with
// a fake LLM; reveal emission on tool calls.

import { describe, expect, it, vi } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { LLMAdapter } from "../loop/loop.ts";
import { TurnGateway, resolveTurnProviders, setTranscriptMirror } from "./gateway.ts";
import { HarnessHub } from "../ws/hub.ts";

function fakeLlm(chunks: Array<{ type: "token"; content: string }>): LLMAdapter {
  return {
    async *stream() {
      for (const c of chunks) yield c as never;
    },
  };
}

function toolLlm(): LLMAdapter {
  let calls = 0;
  return {
    async *stream() {
      calls++;
      if (calls === 1) {
        yield {
          type: "tool_call",
          toolCall: { id: "c1", name: "execute_sql", args: { query: "select 1" } },
        } as never;
      } else {
        yield { type: "token", content: "done" } as never;
      }
    },
  };
}

describe("turn gateway (m3h)", () => {
  it("starts a turn and broadcasts events to subscribers", async () => {
    const gateway = new TurnGateway();
    const seen: HarnessEvent[] = [];
    const hub = new HarnessHub();
    gateway.attachWs(hub);
    try {
      const turnId = await gateway.startTurn(
        {
          sessionId: "s-gw",
          appPath: "/tmp/caide-test-app",
          prompt: "hi",
          mode: "ask",
          settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        },
        { llmOverride: fakeLlm([{ type: "token", content: "yo" }]), onEvent: (e) => seen.push(e) },
      );
      expect(typeof turnId).toBe("string");
      expect(seen[0]).toMatchObject({ type: "turn_start", prompt: "hi" });
      expect(seen.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
      expect(gateway.getStatus()).toBe("completed");
    } finally {
      gateway.detachWs();
    }
  });

  it("emits database reveals for DB tool calls", async () => {
    const gateway = new TurnGateway();
    const seen: HarnessEvent[] = [];
    await gateway.startTurn(
      {
        sessionId: "s-reveal",
        appPath: "/tmp/caide-test-app",
        prompt: "query",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      },
      { llmOverride: toolLlm(), onEvent: (e) => seen.push(e) },
    );
    expect(seen).toContainEqual(
      expect.objectContaining({ type: "ui_reveal", pane: "database", reason: "execute_sql" }),
    );

    const previewSeen: HarnessEvent[] = [];
    await gateway.startTurn(
      {
        sessionId: "s-reveal",
        appPath: "/tmp/caide-test-app",
        prompt: "open it",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      },
      {
        llmOverride: {
          async *stream() {
            yield {
              type: "tool_call",
              toolCall: { id: "c2", name: "open_preview", args: {} },
            } as never;
          },
        } as LLMAdapter,
        onEvent: (e) => previewSeen.push(e),
      },
    );
    expect(previewSeen).toContainEqual(
      expect.objectContaining({ type: "ui_reveal", pane: "preview", reason: "open_preview" }),
    );
  });

  it("steers and cancels through the gateway", async () => {
    const gateway = new TurnGateway();
    const inbox = gateway.getInbox("s-steer");
    inbox.steer("extra context");
    gateway.cancelTurn("s-steer");
    gateway.dropSession("s-steer");
    expect(gateway.getInbox("s-steer")).not.toBe(inbox);
  });

  it("mirrors turn_start/token/tool_call/turn_end to the transcript mirror only", async () => {
    const seen: HarnessEvent[] = [];
    setTranscriptMirror({ mirrorHarnessTurnEvent: (e) => seen.push(e) });
    try {
      const gateway = new TurnGateway();
      await gateway.startTurn(
        {
          sessionId: "s-mirror",
          appPath: "/tmp/caide-test-app",
          prompt: "hey",
          mode: "ask",
          settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        },
        {
          llmOverride: {
            async *stream() {
              yield { type: "token", content: "hi" } as never;
              yield {
                type: "tool_call",
                toolCall: { id: "c1", name: "execute_sql", args: {} },
              } as never;
            },
          },
          onEvent: () => {},
        },
      );
      const types = seen.map((e) => e.type);
      expect(types).toContain("turn_start");
      expect(types).toContain("token");
      expect(types).toContain("turn_end");
      // Tool calls mirror inline as <caide-tool> tags (AntigravityToolGroup),
      // so history never stacks above the chat header.
      expect(types).toContain("tool_call");
      expect(types).not.toContain("stage");
      gateway.dropSession("s-mirror");
    } finally {
      setTranscriptMirror(null);
    }
  });

  it("steers a duplicate send into the running turn instead of forking a parallel loop", async () => {
    const gateway = new TurnGateway();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let streams = 0;
    const hanging: LLMAdapter = {
      async *stream() {
        streams += 1;
        await gate;
        yield { type: "token", content: "first-done" } as never;
      },
    };
    const seen: HarnessEvent[] = [];
    const base = {
      sessionId: "s-dup",
      appPath: "/tmp/caide-test-app",
      mode: "ask" as const,
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
    };
    const first = gateway.startTurn(
      { ...base, prompt: "first" },
      {
        llmOverride: hanging,
        onEvent: (e) => seen.push(e),
      },
    );
    const deadline = Date.now() + 5000;
    while (streams === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(streams).toBe(1);
    const secondId = await gateway.startTurn(
      { ...base, prompt: "second" },
      {
        llmOverride: fakeLlm([{ type: "token", content: "SHOULD-NEVER-STREAM" }]),
        onEvent: () => {},
      },
    );
    expect(secondId.startsWith("buffered:")).toBe(true);
    expect(streams).toBe(1);
    const steered = gateway.getInbox("s-dup").claimNextStep();
    expect(steered).toHaveLength(1);
    expect(steered[0]).toMatchObject({ type: "steer", prompt: "second" });
    release();
    await first;
    expect(gateway.getStatus()).toBe("completed");
    const tokens = seen
      .filter((e) => e.type === "token")
      .map((e) => (e as { content: string }).content);
    expect(tokens).toContain("first-done");
    expect(tokens).not.toContain("SHOULD-NEVER-STREAM");
    // Slot released on completion: the next send launches fresh, not buffered.
    const thirdId = await gateway.startTurn(
      { ...base, prompt: "third" },
      {
        llmOverride: fakeLlm([{ type: "token", content: "third-done" }]),
        onEvent: () => {},
      },
    );
    expect(thirdId.startsWith("turn-")).toBe(true);
    gateway.dropSession("s-dup");
  });

  it("runs a second session's send while another session's turn is live (no cross-session swallow)", async () => {
    const gateway = new TurnGateway();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hanging: LLMAdapter = {
      async *stream() {
        await gate;
        yield { type: "token", content: "a-done" } as never;
      },
    };
    const settings = { providerSettings: { openai: { apiKey: "sk-test" } } };
    const first = gateway.startTurn(
      {
        sessionId: "s-a",
        appPath: "/tmp/caide-test-app",
        prompt: "a-first",
        mode: "ask",
        settings,
      },
      { llmOverride: hanging, onEvent: () => {} },
    );
    // Give A's turn a chance to claim its (per-session) flow slot.
    await new Promise((r) => setTimeout(r, 50));
    const bId = await gateway.startTurn(
      {
        sessionId: "s-b",
        appPath: "/tmp/caide-test-app",
        prompt: "b-first",
        mode: "ask",
        settings,
      },
      { llmOverride: fakeLlm([{ type: "token", content: "b-done" }]), onEvent: () => {} },
    );
    expect(bId.startsWith("turn-")).toBe(true);
    expect(bId.startsWith("buffered:")).toBe(false);
    release();
    await first;
    expect(gateway.getStatus()).toBe("completed");
    gateway.dropSession("s-a");
    gateway.dropSession("s-b");
  });

  it("cancel on an idle session settles the UI with a synthetic turn_end", () => {
    const gateway = new TurnGateway();
    const hub = new HarnessHub();
    gateway.attachWs(hub);
    const spy = vi.spyOn(hub, "broadcastToSession");
    try {
      gateway.cancelTurn("s-idle");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[1]).toMatchObject({
        type: "turn_end",
        sessionId: "s-idle",
        status: "cancelled",
      });
    } finally {
      gateway.detachWs();
      gateway.dropSession("s-idle");
    }
  });

  it("resolves turn providers: explicit wins, else stored defaults", () => {
    const explicit = resolveTurnProviders({
      sessionId: "s",
      appPath: "/tmp/x",
      prompt: "hi",
      providerId: "openai",
      modelId: "gpt-5",
      settings: { providerSettings: { openai: { apiKey: "sk-x" } } },
    });
    expect(explicit.providerId).toBe("openai");
    expect(explicit.modelId).toBe("gpt-5");

    const fallback = resolveTurnProviders({ sessionId: "s", appPath: "/tmp/x", prompt: "hi" });
    expect(fallback.settings).toBeDefined();
    // undefined defaults are fine — the turn context auto-resolves by key.
    expect(fallback.providerId).toBeUndefined();
  });

  it("never forwards placeholder model slugs to endpoints", () => {
    const settings = { providerSettings: { openai: { apiKey: "sk-x" } } };
    for (const modelId of ["auto", "default", undefined]) {
      const resolved = resolveTurnProviders({
        sessionId: "s",
        appPath: "/tmp/x",
        prompt: "hi",
        providerId: "openai",
        ...(modelId ? { modelId } : {}),
        settings,
      });
      expect(resolved.modelId).toBeTruthy();
      expect(["auto", "default"]).not.toContain(resolved.modelId);
    }
    const concrete = resolveTurnProviders({
      sessionId: "s",
      appPath: "/tmp/x",
      prompt: "hi",
      providerId: "openai",
      modelId: "gpt-5",
      settings,
    });
    expect(concrete.modelId).toBe("gpt-5");
  });

  it("answers provider settings get/set over the socket handlers", async () => {
    const gateway = new TurnGateway();
    const sent: HarnessEvent[] = [];
    const handlers: Record<string, (...args: never[]) => void> = {};
    const server = {
      broadcastToSession: (sessionId: string, event: HarnessEvent) => {
        void sessionId;
        sent.push(event);
      },
      onPromptAnswer: (h: (...args: never[]) => void) => {
        handlers.prompt = h;
      },
      onConsentAnswer: (h: (...args: never[]) => void) => {
        handlers.consent = h;
      },
      onSettingsSync: (h: (...args: never[]) => void) => {
        handlers.settings = h;
      },
      onSteer: (h: (...args: never[]) => void) => {
        handlers.steer = h;
      },
      onCancel: (h: (...args: never[]) => void) => {
        handlers.cancel = h;
      },
      onBlueprintResponse: (h: (...args: never[]) => void) => {
        handlers.blueprint = h;
      },
      onCheckpointResponse: (h: (...args: never[]) => void) => {
        handlers.checkpoint = h;
      },
      onMcpOAuthStart: (h: (...args: never[]) => void) => {
        handlers.mcpOAuth = h;
      },
      onTurnStart: (h: (...args: never[]) => void) => {
        handlers.turn = h;
      },
      onCompactNow: (h: (...args: never[]) => void) => {
        handlers.compact = h;
      },
      onProviderSettingsGet: (h: (...args: never[]) => void) => {
        handlers.psGet = h;
      },
      onProviderSettingsSet: (h: (...args: never[]) => void) => {
        handlers.psSet = h;
      },
      onProviderSettingsTest: (h: (...args: never[]) => void) => {
        handlers.psTest = h;
      },
      onProviderCustomSave: (h: (...args: never[]) => void) => {
        handlers.customSave = h;
      },
      onProviderCustomDelete: (h: (...args: never[]) => void) => {
        handlers.customDelete = h;
      },
      onVersionsList: (h: (...args: never[]) => void) => {
        handlers.versionsList = h;
      },
      onVersionsRestore: (h: (...args: never[]) => void) => {
        handlers.versionsRestore = h;
      },
    } as unknown as HarnessHub;
    gateway.attachWs(server);
    try {
      const get = handlers.psGet as (sid: string, req?: string) => void;
      get("s-ps", "r1");
      const state = sent.find((e) => e.type === "provider_settings_state");
      expect(state).toMatchObject({ sessionId: "s-ps", requestId: "r1" });
      expect(Array.isArray((state as unknown as { providers: unknown[] }).providers)).toBe(true);
    } finally {
      gateway.detachWs();
    }
  });

  it("validates provider settings on set and skips unknown providers", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "caide-home-"));
    process.env.CAIDE_HOME = home;
    const { resetSharedProviderSecrets, sharedProviderSecrets } =
      await import("../../dyad/providers/secrets.ts");
    resetSharedProviderSecrets();
    const gateway = new TurnGateway();
    const sent: HarnessEvent[] = [];
    const handlers: Record<string, (...args: never[]) => void> = {};
    const server = {
      broadcastToSession: (sessionId: string, event: HarnessEvent) => {
        void sessionId;
        sent.push(event);
      },
    } as unknown as HarnessHub;
    for (const name of [
      "onPromptAnswer",
      "onConsentAnswer",
      "onSettingsSync",
      "onSteer",
      "onCancel",
      "onBlueprintResponse",
      "onCheckpointResponse",
      "onMcpOAuthStart",
      "onTurnStart",
      "onCompactNow",
      "onProviderSettingsGet",
      "onProviderSettingsSet",
      "onProviderSettingsTest",
      "onProviderCustomSave",
      "onProviderCustomDelete",
      "onVersionsList",
      "onVersionsRestore",
    ]) {
      (server as unknown as Record<string, unknown>)[name] = (h: (...args: never[]) => void) => {
        handlers[name] = h;
      };
    }
    gateway.attachWs(server);
    try {
      type SetFn = (
        sid: string,
        providerId: string,
        entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string },
        defaults?: { providerId?: string; modelId?: string },
        requestId?: string,
      ) => void;
      const set = handlers.onProviderSettingsSet as SetFn;
      set("s-psv", "azure", { apiKey: "k" }, undefined, "r-azure");
      const azureState = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-azure",
      ) as unknown as { tests?: Record<string, { ok: boolean; message: string }> };
      expect(azureState?.tests?.azure?.ok).toBe(false);
      expect(azureState?.tests?.azure?.message).toMatch(/Resource Name/);
      // Saved despite the warning (turn-time failure, not a silent drop).
      expect(sharedProviderSecrets().read().providers.azure?.apiKey).toBe("k");

      set("s-psv", "nope", { apiKey: "k" }, undefined, "r-nope");
      const nopeState = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-nope",
      ) as unknown as { tests?: Record<string, { ok: boolean; message: string }> };
      expect(nopeState?.tests?.nope?.ok).toBe(false);
      expect(sharedProviderSecrets().read().providers.nope).toBeUndefined();
    } finally {
      gateway.detachWs();
      resetSharedProviderSecrets();
      delete process.env.CAIDE_HOME;
    }
  });

  it("saves, lists, and deletes custom providers over the socket handlers", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "caide-home-"));
    process.env.CAIDE_HOME = home;
    const { resetSharedProviderSecrets } = await import("../../dyad/providers/secrets.ts");
    const { resetSharedCustomProviders, sharedCustomProviders } =
      await import("../../dyad/providers/customProviders.ts");
    resetSharedProviderSecrets();
    resetSharedCustomProviders();
    const gateway = new TurnGateway();
    const sent: HarnessEvent[] = [];
    const handlers: Record<string, (...args: never[]) => void> = {};
    const server = {
      broadcastToSession: (sessionId: string, event: HarnessEvent) => {
        void sessionId;
        sent.push(event);
      },
      onProviderCustomSave: (h: (...args: never[]) => void) => {
        handlers.customSave = h;
      },
      onProviderCustomDelete: (h: (...args: never[]) => void) => {
        handlers.customDelete = h;
      },
    } as unknown as HarnessHub;
    // Reuse the shared fake-hub surface for the remaining handlers.
    for (const name of [
      "onPromptAnswer",
      "onConsentAnswer",
      "onSettingsSync",
      "onSteer",
      "onCancel",
      "onBlueprintResponse",
      "onCheckpointResponse",
      "onMcpOAuthStart",
      "onTurnStart",
      "onCompactNow",
      "onProviderSettingsGet",
      "onProviderSettingsSet",
      "onProviderSettingsTest",
      "onVersionsList",
      "onVersionsRestore",
    ]) {
      if (!(server as unknown as Record<string, unknown>)[name]) {
        (server as unknown as Record<string, unknown>)[name] = (h: (...args: never[]) => void) => {
          handlers[name] = h;
        };
      }
    }
    gateway.attachWs(server);
    try {
      type SaveFn = (
        sid: string,
        provider:
          | { id?: string; displayName?: string; baseUrl?: string; envVarName?: string }
          | undefined,
        models: Array<{ name?: string }> | undefined,
        requestId?: string,
      ) => void;
      type DeleteFn = (sid: string, providerId: string, requestId?: string) => void;
      const save = handlers.customSave as SaveFn;
      const del = handlers.customDelete as DeleteFn;
      // Invalid definition rejected with feedback, nothing persisted.
      save(
        "s-cp",
        { id: "nope", displayName: "Nope", baseUrl: "https://x/v1" },
        undefined,
        "r-bad",
      );
      const badState = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-bad",
      ) as unknown as { tests?: Record<string, { ok: boolean; message: string }> };
      expect(badState?.tests?.["nope"]?.ok).toBe(false);
      expect(sharedCustomProviders().getProvider("nope")).toBeUndefined();
      // Valid save persists and rides the state broadcast.
      save(
        "s-cp",
        { id: "custom::proxy", displayName: "Proxy", baseUrl: "https://p/v1" },
        [{ name: "m1" }],
        "r-save",
      );
      const saveState = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-save",
      ) as unknown as {
        tests?: Record<string, { ok: boolean; message: string }>;
        customProviders?: Array<{ id: string; models: Array<{ name: string }> }>;
      };
      expect(saveState?.tests?.["custom::proxy"]?.ok).toBe(true);
      expect(saveState?.customProviders).toMatchObject([
        { id: "custom::proxy", models: [{ name: "m1" }] },
      ]);
      expect(sharedCustomProviders().getProvider("custom::proxy")?.baseUrl).toBe("https://p/v1");
      // Delete removes it and refreshes state.
      del("s-cp", "custom::proxy", "r-del");
      const delState = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-del",
      ) as unknown as { tests?: Record<string, { ok: boolean; message: string }> };
      expect(delState?.tests?.["custom::proxy"]?.ok).toBe(true);
      expect(sharedCustomProviders().getProvider("custom::proxy")).toBeUndefined();
      del("s-cp", "custom::missing", "r-del2");
      const del2State = sent.find(
        (e) =>
          e.type === "provider_settings_state" &&
          (e as { requestId?: string }).requestId === "r-del2",
      ) as unknown as { tests?: Record<string, { ok: boolean; message: string }> };
      expect(del2State?.tests?.["custom::missing"]?.ok).toBe(false);
    } finally {
      gateway.detachWs();
      resetSharedProviderSecrets();
      resetSharedCustomProviders();
      delete process.env.CAIDE_HOME;
    }
  });

  it("lists and restores app versions over the socket handlers", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { execFileSync } = await import("node:child_process");
    const { noteSessionApp } = await import("./sessionStores.ts");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-gwver-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");

    const gateway = new TurnGateway();
    const sent: HarnessEvent[] = [];
    const handlers: Record<string, (...args: never[]) => void> = {};
    const server = {
      broadcastToSession: (sessionId: string, event: HarnessEvent) => {
        void sessionId;
        sent.push(event);
      },
    } as unknown as HarnessHub;
    for (const name of [
      "onPromptAnswer",
      "onConsentAnswer",
      "onSettingsSync",
      "onSteer",
      "onCancel",
      "onBlueprintResponse",
      "onCheckpointResponse",
      "onMcpOAuthStart",
      "onTurnStart",
      "onCompactNow",
      "onProviderSettingsGet",
      "onProviderSettingsSet",
      "onProviderSettingsTest",
      "onProviderCustomSave",
      "onProviderCustomDelete",
      "onVersionsList",
      "onVersionsRestore",
    ]) {
      (server as unknown as Record<string, unknown>)[name] = (h: (...args: never[]) => void) => {
        handlers[name] = h;
      };
    }
    gateway.attachWs(server);
    try {
      noteSessionApp("s-ver", dir);
      const list = handlers.onVersionsList as (sid: string) => void;
      list("s-ver");
      await new Promise((r) => setTimeout(r, 50));
      // No versions yet (only the init commit, no version entries).
      const empty = sent.find((e) => e.type === "versions_state");
      expect(empty).toMatchObject({ sessionId: "s-ver" });

      // Restore the committed init state over dirty work.
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
      const restore = handlers.onVersionsRestore as (sid: string, hash: string) => void;
      restore("s-ver", head);
      await new Promise((r) => setTimeout(r, 200));
      expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("v1\n");
      const refreshed = sent.filter((e) => e.type === "versions_state");
      expect(refreshed.length).toBeGreaterThanOrEqual(1);
    } finally {
      gateway.detachWs();
    }
  });
});
