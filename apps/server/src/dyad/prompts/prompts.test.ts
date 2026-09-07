// FILE: prompts.test.ts
// Purpose: M1 gate — Dyad-transplant prompt layer assembles correctly.

import { describe, expect, it } from "vitest";
import {
  buildFrameworkNotice,
  buildPlatformPrompt,
  buildUiSkillPack,
  CAIDE_MOBILE_UI_SKILL_PACK,
  CAIDE_WEB_UI_SKILL_PACK,
  COMPACTION_SYSTEM_PROMPT,
  constructLocalAgentPrompt,
  constructPlanModePrompt,
  constructSystemPrompt,
  DESIGN_ENGINE_CONTRACT,
  getSystemPromptForChatMode,
  INSPIRATION_PROMPTS,
  MOBILE_PRODUCT_CONTRACT,
  SECURITY_REVIEW_SYSTEM_PROMPT,
  SUMMARIZE_CHAT_SYSTEM_PROMPT,
  TEST_ASSERTION_CODE_SYSTEM_PROMPT,
  buildAssertionCodePayload,
  GIT_CONTEXT_BLOCK,
  BUILD_GIT_CONTEXT_BLOCK,
  buildGitReminder,
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

  it("ships donor-verbatim utility prompts (compaction/summarize/security)", () => {
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Key Decisions Made");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("## Standing Preferences & Constraints");
    expect(COMPACTION_SYSTEM_PROMPT).toContain("Skip empty sections");
    expect(SUMMARIZE_CHAT_SYSTEM_PROMPT).toContain("YOU MUST CALL `set_chat_summary` EXACTLY ONCE");
    expect(SECURITY_REVIEW_SYSTEM_PROMPT).toContain("<dyad-security-finding");
    expect(SECURITY_REVIEW_SYSTEM_PROMPT).toContain("Begin your security review.");
  });

  it("emits no provider invariants by default, injects them when connected", () => {
    const base = { aiRules: undefined, enableTurboEditsV2: false } as const;
    for (const mode of ["build", "ask", "local-agent", "plan"] as const) {
      expect(
        constructSystemPrompt({ ...base, chatMode: mode }),
        `default ${mode} leak`,
      ).not.toContain("<provider_invariants>");
    }

    const agentSupabase = constructSystemPrompt({
      ...base,
      chatMode: "local-agent",
      hasSupabaseProject: true,
      supabaseClientCode: "const supabase = createClient(URL, KEY);",
    });
    expect(agentSupabase).toContain("<provider_invariants>");
    expect(agentSupabase).toContain("# Supabase Instructions");
    expect(agentSupabase).toContain("const supabase = createClient(URL, KEY);");

    const agentSupabaseOff = constructSystemPrompt({
      ...base,
      chatMode: "local-agent",
      hasSupabaseProject: true,
      supabaseConnected: false,
    });
    expect(agentSupabaseOff).toContain("<provider_invariants>");
    expect(agentSupabaseOff).toContain("reconnect the linked Supabase organization");

    const buildNeon = constructSystemPrompt({
      ...base,
      chatMode: "build",
      hasNeonProject: true,
      neonClientCode: "export const sql = neon(process.env.DATABASE_URL!);",
    });
    expect(buildNeon).toContain("<provider_invariants>");
    expect(buildNeon).toContain("<neon-system-prompt>");
    expect(buildNeon).toContain("NEVER implement homegrown auth");

    const buildNeonOff = getSystemPromptForChatMode({
      chatMode: "build",
      hasNeonProject: true,
      neonConnected: false,
    });
    expect(buildNeonOff).toContain("reconnect Neon or select an active branch");
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

  it("ships the assertion-synthesis prompt and inspiration list", () => {
    expect(TEST_ASSERTION_CODE_SYSTEM_PROMPT).toContain("Return ONLY JSON");
    expect(TEST_ASSERTION_CODE_SYSTEM_PROMPT).toContain("await expect(");
    const payload = buildAssertionCodePayload({
      testTitle: "login",
      bodyStatements: ["await page.goto('/');"],
      requests: [{ id: "a1", afterStep: 0, text: "shows welcome" }],
    });
    expect(payload).toContain("Playwright test: login");
    expect(payload).toContain("0: await page.goto('/');");
    expect(payload).toContain("a1 | after step 0 | shows welcome");

    expect(INSPIRATION_PROMPTS).toHaveLength(16);
    const labels = INSPIRATION_PROMPTS.map((p) => p.label);
    expect(labels).toContain("Pantry recipe planner");
    expect(labels).toContain("Personal launch page");
    expect(new Set(labels).size).toBe(16);
  });

  it("appends git provenance blocks only when requested, builds reminders", () => {
    const base = { aiRules: undefined, enableTurboEditsV2: false } as const;
    expect(constructSystemPrompt({ ...base, chatMode: "local-agent" })).not.toContain("<git_context>");
    expect(constructSystemPrompt({ ...base, chatMode: "build" })).not.toContain("<git_context>");

    const agent = constructSystemPrompt({ ...base, chatMode: "local-agent", gitProvenance: true });
    expect(agent).toContain(GIT_CONTEXT_BLOCK);
    expect(agent).not.toContain(BUILD_GIT_CONTEXT_BLOCK);

    const build = getSystemPromptForChatMode({ chatMode: "build", gitProvenance: true });
    expect(build).toContain(BUILD_GIT_CONTEXT_BLOCK);

    expect(buildGitReminder({ commitHash: "abc123" })).toBe(
      "<system-reminder>Previous assistant message created commit: abc123.</system-reminder>",
    );
    expect(buildGitReminder({ sourceCommitHash: "def456" })).toBe(
      "<system-reminder>Previous assistant message created no commit. Repository commit before that message: def456.</system-reminder>",
    );
    expect(buildGitReminder(undefined)).toBeNull();
    expect(buildGitReminder({})).toBeNull();
    expect(buildGitReminder({ commitHash: "a<b>&c" })).toContain("a&lt;b&gt;&amp;c");
  });

  it("threads the Next.js major version into Neon boundary guidance", () => {
    const base = { aiRules: undefined, enableTurboEditsV2: false } as const;
    const modern = constructSystemPrompt({
      ...base,
      chatMode: "build",
      hasNeonProject: true,
      neonClientCode: "export const sql = neon(process.env.DATABASE_URL!);",
      frameworkType: "nextjs",
      neonNextjsMajorVersion: 16,
    });
    expect(modern).toContain("proxy.ts");
    const legacy = constructSystemPrompt({
      ...base,
      chatMode: "build",
      hasNeonProject: true,
      neonClientCode: "export const sql = neon(process.env.DATABASE_URL!);",
      frameworkType: "nextjs",
      neonNextjsMajorVersion: 14,
    });
    expect(legacy).toContain("in `middleware.ts`");
    expect(legacy).toContain("NOT available here");
  });
});
