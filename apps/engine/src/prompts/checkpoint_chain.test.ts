import { describe, expect, it } from "vitest";
import {
  advanceChain,
  buildCheckpointChain,
  buildPassPrompt,
  createChain,
  isBackendCodePath,
  isOnboardingScreenPath,
  type CheckpointChainConfig,
} from "./checkpoint_chain";

const config: CheckpointChainConfig = {
  isNewApp: false,
  hasOnboardingScreens: false,
  hasBackendCode: false,
  freeModelMode: false,
  isWebApp: false,
};

const CORE = [
  "ui-ux-core",
  "motion-interaction",
  "accessibility",
  "platform-patterns",
  "anti-ai-slop",
];

describe("buildCheckpointChain", () => {
  it("always runs the 5-pass core ending with anti-slop", () => {
    const passes = buildCheckpointChain(config);
    expect(passes.map((p) => p.id)).toEqual(CORE);
  });

  it("includes product-flow first for new apps", () => {
    const passes = buildCheckpointChain({ ...config, isNewApp: true });
    expect(passes[0].id).toBe("product-flow");
    expect(passes.map((p) => p.id)).toContain("product-flow");
  });

  it("includes onboarding-welcome when the plan or build touches onboarding screens", () => {
    const passes = buildCheckpointChain({
      ...config,
      hasOnboardingScreens: true,
    });
    expect(passes.map((p) => p.id)).toContain("onboarding-welcome");
  });

  it("includes welcome-screens for new apps and onboarding touches, but not web", () => {
    const forNew = buildCheckpointChain({ ...config, isNewApp: true });
    expect(forNew.map((p) => p.id)).toContain("welcome-screens");

    const forOnboarding = buildCheckpointChain({
      ...config,
      hasOnboardingScreens: true,
    });
    expect(forOnboarding.map((p) => p.id)).toContain("welcome-screens");

    const webNew = buildCheckpointChain({
      ...config,
      isNewApp: true,
      isWebApp: true,
    });
    expect(webNew.map((p) => p.id)).not.toContain("welcome-screens");
  });

  it("includes backend-production only when backend code was touched", () => {
    const passes = buildCheckpointChain({ ...config, hasBackendCode: true });
    expect(passes.map((p) => p.id)).toContain("backend-production");
    expect(buildCheckpointChain(config).map((p) => p.id)).not.toContain("backend-production");
  });

  it("skips onboarding-welcome for web apps", () => {
    const passes = buildCheckpointChain({
      ...config,
      hasOnboardingScreens: true,
      isWebApp: true,
    });
    expect(passes.map((p) => p.id)).not.toContain("onboarding-welcome");
  });

  it("free tier drops conditional skills but keeps the core suite", () => {
    const full = buildCheckpointChain({
      ...config,
      isNewApp: true,
      hasOnboardingScreens: true,
      hasBackendCode: true,
    });
    const free = buildCheckpointChain({
      ...config,
      isNewApp: true,
      hasOnboardingScreens: true,
      hasBackendCode: true,
      freeModelMode: true,
    });
    expect(full.map((p) => p.id)).toEqual([
      "product-flow",
      "welcome-screens",
      "onboarding-welcome",
      "backend-production",
      ...CORE,
    ]);
    expect(free.map((p) => p.id)).toEqual(CORE);
  });

  it("flutter apps get Dart-widget-targeted pass bodies", () => {
    const passes = buildCheckpointChain({
      ...config,
      isNewApp: true,
      hasOnboardingScreens: true,
      frameworkType: "flutter",
    });
    expect(passes.map((p) => p.id)).toEqual([
      "product-flow",
      "welcome-screens",
      "onboarding-welcome",
      ...CORE,
    ]);
    for (const pass of passes) {
      expect(pass.body).toMatch(/Flutter|Dart|NavigationBar|widget tree|Material/i);
    }
    const core = passes.find((p) => p.id === "ui-ux-core");
    expect(core?.body).toContain("run `flutter analyze`");
    expect(core?.body).toContain("LayoutBuilder");
  });

  it("free-tier flutter apps keep the 5-pass core with Flutter bodies", () => {
    const passes = buildCheckpointChain({
      ...config,
      freeModelMode: true,
      frameworkType: "flutter",
    });
    expect(passes.map((p) => p.id)).toEqual(CORE);
    expect(passes[0].body).toContain("FLUTTER UI/UX CORE");
  });
});

describe("advanceChain", () => {
  it("returns the first pass on a fresh chain", () => {
    const chain = createChain({ ...config, isNewApp: true });
    const { step, pass } = advanceChain(chain, true);
    expect(step).toBe("next");
    expect(pass?.id).toBe("product-flow");
  });

  it("moves to the next pass after an edited pass", () => {
    const chain = createChain({ ...config, isNewApp: true });
    advanceChain(chain, true);
    const { step, pass } = advanceChain(chain, true);
    expect(step).toBe("next");
    expect(pass?.id).toBe("welcome-screens");
  });

  it("retries a zero-change pass exactly once", () => {
    const chain = createChain(config);
    const first = advanceChain(chain, false);
    expect(first.step).toBe("next");
    expect(first.pass?.id).toBe("ui-ux-core");

    const retry = advanceChain(chain, false);
    expect(retry.step).toBe("retry");
    expect(retry.pass?.id).toBe("ui-ux-core");

    const next = advanceChain(chain, false);
    expect(next.step).toBe("next");
    expect(next.pass?.id).toBe("motion-interaction");
  });

  it("returns done when the chain is exhausted", () => {
    const chain = createChain(config);
    for (const _ of CORE) {
      advanceChain(chain, true);
    }
    const done = advanceChain(chain, true);
    expect(done.step).toBe("done");
    expect(done.pass).toBeNull();
  });
});

describe("buildPassPrompt", () => {
  it("embeds the skill body in a checkpoint directive", () => {
    const chain = createChain(config);
    const first = advanceChain(chain, true).pass!;
    const prompt = buildPassPrompt(first);
    expect(prompt).toContain(`Checkpoint pass: ${first.id}`);
    expect(prompt).toContain(`<checkpoint-skill name="${first.id}">`);
    expect(prompt).toContain(first.body);
  });

  it("adds a retry note when requested", () => {
    const chain = advanceChain(createChain(config), true).pass!;
    const prompt = buildPassPrompt(chain, { retry: true });
    expect(prompt).toContain("previous attempt at this pass made no changes");
  });

  it("targets the plan instead of the app when requested", () => {
    const chain = advanceChain(createChain(config), true).pass!;
    const prompt = buildPassPrompt(chain, { target: "plan" });
    expect(prompt).toContain("Inspect the implementation plan");
    expect(prompt).not.toContain("Inspect the current app state");
  });
});

describe("isOnboardingScreenPath", () => {
  it("detects onboarding/welcome screen paths", () => {
    expect(isOnboardingScreenPath("src/pages/Welcome.tsx")).toBe(true);
    expect(isOnboardingScreenPath("src/pages/OnboardingScreen.tsx")).toBe(true);
    expect(isOnboardingScreenPath("src/pages/GetStarted.tsx")).toBe(true);
  });

  it("rejects ordinary screens", () => {
    expect(isOnboardingScreenPath("src/pages/Dashboard.tsx")).toBe(false);
    expect(isOnboardingScreenPath("src/pages/Profile.tsx")).toBe(false);
  });
});

describe("isBackendCodePath", () => {
  it("detects backend/server/supabase paths", () => {
    expect(isBackendCodePath("supabase/functions/auth/index.ts")).toBe(true);
    expect(isBackendCodePath("src/server/routes.ts")).toBe(true);
    expect(isBackendCodePath("backend/app.py")).toBe(true);
    expect(isBackendCodePath("src/api/users.ts")).toBe(true);
  });

  it("rejects frontend-only paths", () => {
    expect(isBackendCodePath("src/pages/Dashboard.tsx")).toBe(false);
    expect(isBackendCodePath("src/components/Button.tsx")).toBe(false);
  });
});
