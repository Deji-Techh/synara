// FILE: prompts.test.ts
// Purpose: M1 gate — Dyad-transplant prompt layer assembles correctly.

import { describe, expect, it } from "vitest";
import {
  buildPlatformPrompt,
  buildUiSkillPack,
  CAIDE_MOBILE_UI_SKILL_PACK,
  CAIDE_WEB_UI_SKILL_PACK,
  constructLocalAgentPrompt,
  constructPlanModePrompt,
  constructSystemPrompt,
  DESIGN_ENGINE_CONTRACT,
  getSystemPromptForChatMode,
  MOBILE_PRODUCT_CONTRACT,
  WEB3_SKILL_PACK,
  WEB_PRODUCT_CONTRACT,
} from "./index.ts";
import { readGuide } from "./skillLoader.ts";

describe("dyad prompt transplant (m1)", () => {
  it("platform contracts cover mobile and web, defaulting to mobile", () => {
    expect(MOBILE_PRODUCT_CONTRACT).toContain("Bottom tab bar");
    expect(MOBILE_PRODUCT_CONTRACT).toContain("44×44");
    expect(WEB_PRODUCT_CONTRACT).toContain("top navbar or sidebar");
    expect(buildPlatformPrompt()).toContain("MOBILE APP");
    expect(buildPlatformPrompt("web")).toContain("WEB APP");
    expect(buildPlatformPrompt("mobile")).toContain("platform-spec");
  });

  it("mobile pack carries preview contract + design engine", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("CAIDE preview contract");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("390x844");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("SUPERIOR DESIGN DIRECTIVE");
    expect(DESIGN_ENGINE_CONTRACT).toContain("Anti-slop constraints");
  });

  it("web pack steers away from mobile patterns", () => {
    expect(CAIDE_WEB_UI_SKILL_PACK).toContain("responsive web app");
    expect(CAIDE_WEB_UI_SKILL_PACK).toContain("Do NOT");
    expect(buildUiSkillPack("web")).toBe(CAIDE_WEB_UI_SKILL_PACK);
    expect(buildUiSkillPack()).toBe(CAIDE_MOBILE_UI_SKILL_PACK);
  });

  it("web3 pack ships all nine modules + multi-chain rules", () => {
    for (const name of [
      "Solana Development",
      "EVM Development",
      "Multi-Chain Wallet",
      "DeFi Protocols",
      "NFTs & Digital Assets",
      "Security",
    ]) {
      expect(WEB3_SKILL_PACK).toContain(name);
    }
    expect(WEB3_SKILL_PACK).toContain("src/caide-web3/");
  });

  it("provision-backend guide is on disk for the read_guide path", () => {
    const guide = readGuide("provision-backend");
    expect(guide.length).toBeGreaterThan(500);
  });

  it("dispatcher routes plan/local-agent/build/ask with no leftover placeholders", () => {
    const plan = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "plan",
      enableTurboEditsV2: false,
    });
    expect(plan).toContain("exit_plan");
    expect(plan).not.toContain("[[AI_RULES]]");

    const agent = constructSystemPrompt({
      aiRules: "# custom rules",
      chatMode: "local-agent",
      enableTurboEditsV2: false,
      appTarget: "mobile",
    });
    expect(agent).toContain("# custom rules");
    expect(agent).toContain("MOBILE APP");
    expect(agent).not.toContain("[[PLATFORM_CONTRACT]]");
    expect(agent).not.toContain("[[PLATFORM_UI_SKILL_PACK]]");

    const agentWeb = constructLocalAgentPrompt(undefined, undefined, {
      appTarget: "web",
    });
    expect(agentWeb).toContain("responsive web app");

    const build = getSystemPromptForChatMode({
      chatMode: "build",
      frameworkType: "vite",
    });
    expect(build).toContain("Server-side Code in Vite Apps");
    const buildSupabase = getSystemPromptForChatMode({
      chatMode: "build",
      frameworkType: "vite",
      hasSupabaseProject: true,
    });
    expect(buildSupabase).not.toContain("Server-side Code in Vite Apps");

    const ask = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "ask",
      enableTurboEditsV2: false,
    });
    expect(ask).toContain("EXPLAIN, DON'T BUILD");

    const planDirect = constructPlanModePrompt(undefined);
    expect(planDirect).toContain("Tech Stack Context");
  });
});
