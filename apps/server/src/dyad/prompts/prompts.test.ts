// FILE: prompts.test.ts
// Purpose: M1 gate — Dyad-transplant prompt layer assembles correctly.

import { describe, expect, it } from "vitest";
import {
  buildFrameworkNotice,
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

  it("prepends the caide framework notice in every mode, donor text untouched", () => {
    const notice = buildFrameworkNotice("flutter");
    expect(notice).toContain("<caide_framework>");
    expect(notice).toContain("flutter pub");
    expect(buildFrameworkNotice("react-native")).toContain("Expo");
    expect(buildFrameworkNotice("website")).toContain("Vite dev server");
    expect(buildFrameworkNotice("blank")).toContain("no preview");

    for (const mode of ["build", "ask", "local-agent", "plan"] as const) {
      const prompt = constructSystemPrompt({
        aiRules: undefined,
        chatMode: mode,
        enableTurboEditsV2: false,
        caideFramework: "react-native",
      });
      expect(prompt.startsWith("<caide_framework>")).toBe(true);
      expect(prompt).toContain("Expo");
    }

    // No framework → donor-exact output, no Caide block.
    const plain = constructSystemPrompt({
      aiRules: undefined,
      chatMode: "build",
      enableTurboEditsV2: false,
    });
    expect(plain).not.toContain("<caide_framework>");
    expect(plain.startsWith("\n<role>")).toBe(true);
  });

  it("isolates frameworks: no stack leaks across RN/flutter/website", () => {
    const base = {
      aiRules: undefined,
      enableTurboEditsV2: false,
    } as const;

    const flutter = constructSystemPrompt({
      ...base,
      chatMode: "local-agent",
      caideFramework: "flutter",
    });
    expect(flutter).toContain("Dart");
    expect(flutter).toContain("flutter pub");
    expect(flutter).toContain("Bottom tab bar"); // mobile target contract
    for (const leak of ["shadcn", "React Router", "Vite", "npm", "sonner", "src/pages", "Tailwind"]) {
      expect(flutter, `flutter leak: ${leak}`).not.toContain(leak);
    }

    const website = constructSystemPrompt({
      ...base,
      chatMode: "local-agent",
      caideFramework: "website",
    });
    expect(website).toContain("Vite");
    expect(website).not.toContain("Bottom tab bar");
    for (const leak of ["Expo", "Dart", "flutter pub", "NativeWind", "Riverpod", "GoRouter"]) {
      expect(website, `website leak: ${leak}`).not.toContain(leak);
    }

    const rn = constructSystemPrompt({
      ...base,
      chatMode: "local-agent",
      caideFramework: "react-native",
    });
    expect(rn).toContain("Expo");
    expect(rn).toContain("Bottom tab bar");
    for (const leak of ["Dart", "flutter pub", "Vite", "shadcn", "GoRouter", "Riverpod"]) {
      expect(rn, `rn leak: ${leak}`).not.toContain(leak);
    }
  });

  it("perfects build mode per framework: Dart examples for flutter, corrected paths for RN", () => {
    const base = {
      aiRules: undefined,
      enableTurboEditsV2: false,
    } as const;

    const flutterBuild = constructSystemPrompt({
      ...base,
      chatMode: "build",
      caideFramework: "flutter",
    });
    expect(flutterBuild).toContain("lib/widgets/app_button.dart");
    expect(flutterBuild).toContain("ScaffoldMessenger");
    expect(flutterBuild).toContain("Material");
    for (const leak of ["Sonner", "sonner", "src/pages", "Tailwind", "shadcn", "Vite", "npm"]) {
      expect(flutterBuild, `flutter build leak: ${leak}`).not.toContain(leak);
    }

    const rnBuild = constructSystemPrompt({
      ...base,
      chatMode: "build",
      caideFramework: "react-native",
    });
    expect(rnBuild).toContain("app/src/screens/");
    expect(rnBuild).not.toContain("src/pages");
    expect(rnBuild).not.toContain("Sonner");
    for (const leak of ["Dart", "flutter pub", "Vite", "shadcn"]) {
      expect(rnBuild, `rn build leak: ${leak}`).not.toContain(leak);
    }

    // Website build stays donor-exact (React examples + Sonner).
    const webBuild = constructSystemPrompt({
      ...base,
      chatMode: "build",
      caideFramework: "website",
    });
    expect(webBuild).toContain("src/pages/Dashboard.tsx");
    expect(webBuild).toContain("Sonner");
  });
});
