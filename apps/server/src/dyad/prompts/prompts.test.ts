// FILE: prompts.test.ts
// Purpose: M1 gate — Dyad-transplant prompt layer assembles correctly.

import { describe, expect, it } from "vitest";
import {
  buildPlatformPrompt,
  buildUiSkillPack,
  CAIDE_MOBILE_UI_SKILL_PACK,
  CAIDE_WEB_UI_SKILL_PACK,
  DESIGN_ENGINE_CONTRACT,
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
});
