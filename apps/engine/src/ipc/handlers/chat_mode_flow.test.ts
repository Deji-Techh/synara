import { describe, expect, it } from "vitest";
import {
  ChatModeSchema,
  StoredChatModeSchema,
  migrateStoredChatMode,
} from "@/lib/schemas";
import { normalizeStoredChatMode, resolveChatMode } from "@/lib/chatMode";
import {
  constructSystemPrompt,
  getSystemPromptForChatMode,
} from "@/prompts/system_prompt";
import {
  buildPlatformPrompt,
  FLUTTER_PRODUCT_CONTRACT,
} from "@/prompts/platform_contracts";
import { EngineTurnModeSchema } from "@/protocol";

// The four agent command/mode flows CAIDE exposes over `chat:stream`:
// build, ask, plan and local-agent. These tests lock the mode value set
// (protocol + schemas), the mode→prompt routing in constructSystemPrompt and
// the chat-stream mode resolution so a refactor can't silently re-route a
// mode to the wrong prompt.

const FOUR_MODES = ["build", "ask", "plan", "local-agent"] as const;

// Minimal unused-settings stand-in for the pure mode-resolution helpers.
// providerSettings must be present and empty so isProviderSetup can read it.
const noProviderSettings = {
  selectedModel: { provider: "none" },
  providerSettings: {},
} as never;

describe("chat mode value set", () => {
  it("EngineTurnModeSchema accepts exactly the four engine modes", () => {
    expect(EngineTurnModeSchema.options.sort()).toEqual([...FOUR_MODES].sort());
    for (const mode of FOUR_MODES) {
      expect(
        EngineTurnModeSchema.safeParse(mode).success,
        `expected "${mode}" to be a valid engine turn mode`,
      ).toBe(true);
    }
    expect(EngineTurnModeSchema.safeParse("agent").success).toBe(false);
  });

  it("ChatModeSchema accepts exactly the four engine modes", () => {
    expect(ChatModeSchema.options.sort()).toEqual([...FOUR_MODES].sort());
  });

  it("StoredChatModeSchema still accepts the deprecated 'agent' and migrates it to build", () => {
    expect(StoredChatModeSchema.safeParse("agent").success).toBe(true);
    expect(migrateStoredChatMode("agent")).toBe("build");
  });
});

describe("chat mode resolution", () => {
  it("normalizes each of the four modes to itself", () => {
    for (const mode of FOUR_MODES) {
      expect(normalizeStoredChatMode(mode)).toBe(mode);
    }
  });

  it("normalizes the deprecated 'agent' mode to build", () => {
    expect(normalizeStoredChatMode("agent")).toBe("build");
  });

  it("rejects unknown stored modes", () => {
    expect(normalizeStoredChatMode("turbo")).toBeNull();
  });

  it("resolveChatMode honors the stored mode for all four modes", () => {
    for (const mode of FOUR_MODES) {
      const resolved = resolveChatMode({
        storedChatMode: mode,
        settings: noProviderSettings,
        envVars: {},
      });
      expect(resolved.mode).toBe(mode);
    }
  });

  it("resolveChatMode falls back to the effective default when no mode is stored", () => {
    const resolved = resolveChatMode({
      storedChatMode: null,
      settings: noProviderSettings,
      envVars: {},
    });
    // No provider is configured, so the engine default is build mode.
    expect(resolved.mode).toBe("build");
  });
});

describe("mode → prompt routing", () => {
  // Build mode: constructSystemPrompt({ chatMode: "build", frameworkType })
  // must inject the Flutter product contract (buildPlatformPrompt always
  // returns the Flutter contract for the Caide product).
  it("build mode selects the Flutter product contract regardless of appTarget", () => {
    expect(FLUTTER_PRODUCT_CONTRACT).toContain(
      "# PLATFORM CONTRACT — FLUTTER APP",
    );
    expect(buildPlatformPrompt("mobile", "flutter")).toContain(
      "FLUTTER ONLY — NEVER web/React",
    );
    expect(buildPlatformPrompt("mobile", "flutter")).toContain(
      "PLATFORM SPEC (always remember)",
    );

    const buildPrompt = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "build",
      enableTurboEditsV2: false,
      frameworkType: "flutter",
      appTarget: "mobile",
    });
    expect(buildPrompt).toContain("# PLATFORM CONTRACT — FLUTTER APP");
    expect(buildPrompt).toContain("FLUTTER ONLY — NEVER web/React");
    expect(buildPrompt).toContain("USE <caide-write> EXCLUSIVELY FOR CODE");
  });

  it("ask mode selects ASK_MODE_SYSTEM_PROMPT", () => {
    const askPrompt = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "ask",
      enableTurboEditsV2: false,
    });
    expect(askPrompt).toContain("CRITICAL RULES FOR ASK MODE");
    expect(askPrompt).toContain("EXPLAIN, DON'T BUILD");
    expect(askPrompt).toContain("You are NOT making code changes to the project.");

    // getSystemPromptForChatMode returns ASK_MODE_SYSTEM_PROMPT verbatim
    // (constructSystemPrompt on top of it injects AI_RULES).
    const rawAsk = getSystemPromptForChatMode({
      chatMode: "ask",
      enableTurboEditsV2: false,
    });
    expect(rawAsk).toContain("CRITICAL RULES FOR ASK MODE");
    expect(rawAsk).not.toContain("# Tech Stack");
  });

  it("plan mode selects the plan-mode prompt", () => {
    const planPrompt = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "plan",
      enableTurboEditsV2: false,
    });
    expect(planPrompt).toContain("You are CAIDE Plan Mode");
    expect(planPrompt).toContain("NEVER write code or make file changes in plan mode");
    expect(planPrompt).toContain("exit_plan");
  });

  it("local-agent mode selects constructLocalAgentPrompt with the Flutter contract", () => {
    const localAgentPrompt = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "local-agent",
      enableTurboEditsV2: false,
      frameworkType: "flutter",
      codeExplorerAvailable: true,
      appTarget: "mobile",
    });
    // Main local-agent prompt: full-access workflow + Flutter contract.
    expect(localAgentPrompt).toContain("# PLATFORM CONTRACT — FLUTTER APP");
    expect(localAgentPrompt).toContain("spawn_subagent");
    // Not the read-only ask variant.
    expect(localAgentPrompt).not.toContain("You are in READ-ONLY mode");
  });

  it("the chat-stream ask branch routes through the read-only local-agent prompt", () => {
    // chat:stream_handlers.ts dispatches ask mode with
    // constructSystemPrompt({ chatMode: "local-agent", readOnly: true }) so
    // ASK_MODE_SYSTEM_PROMPT is not what the ask stream uses at runtime — ask
    // runs the read-only local-agent variant that keeps read tools available.
    const readOnlyPrompt = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "local-agent",
      enableTurboEditsV2: false,
      readOnly: true,
    });
    expect(readOnlyPrompt).toContain("You are in READ-ONLY mode");
    expect(readOnlyPrompt).not.toContain("CRITICAL RULES FOR ASK MODE");
  });
});
