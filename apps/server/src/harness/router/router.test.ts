import { describe, it, expect } from "vitest";
import { classifyIntent, classifyIntentSync, type RouterIntent } from "./index.ts";

describe("Milestone M6 — Router (Fast Intent Classification)", () => {
  const samplePrompts: Array<{ prompt: string; expectedIntent: RouterIntent }> = [
    // 4 Ask Prompts
    { prompt: "What is the difference between React Native and Flutter?", expectedIntent: "ask" },
    { prompt: "How does state management work in this project?", expectedIntent: "ask" },
    { prompt: "Why do we use 44px tap targets for mobile?", expectedIntent: "ask" },
    { prompt: "Can you explain how the design tokens are structured?", expectedIntent: "ask" },

    // 4 Plan Prompts
    { prompt: "Let's plan the new authentication and onboarding flow", expectedIntent: "plan" },
    { prompt: "/plan design the e-commerce checkout spec", expectedIntent: "plan" },
    { prompt: "Create a specification for user profiles and settings", expectedIntent: "plan" },
    { prompt: "Scope out the user flows and roadmap for v1", expectedIntent: "plan" },

    // 4 Build Prompts
    { prompt: "Create a modern login screen with email and Google auth", expectedIntent: "build" },
    { prompt: "Implement the product card component with price and rating", expectedIntent: "build" },
    { prompt: "Add a bottom navigation tab bar with home and search", expectedIntent: "build" },
    { prompt: "Build the checkout payment sheet with card input", expectedIntent: "build" },

    // 4 Verify Prompts
    { prompt: "Verify the UI against the design tokens in design-spec.json", expectedIntent: "verify" },
    { prompt: "/verify audit the accessibility and tap targets of the screen", expectedIntent: "verify" },
    { prompt: "Review UI and compare screenshots with the theme specification", expectedIntent: "verify" },
    { prompt: "Check design contrast and layout for any token violations", expectedIntent: "verify" },

    // 4 Fix Prompts
    { prompt: "Fix the TypeError in the profile screen render loop", expectedIntent: "fix" },
    { prompt: "/fix the broken submit button that crashes on tap", expectedIntent: "fix" },
    { prompt: "Repair the compile error: Cannot find module './types'", expectedIntent: "fix" },
    { prompt: "Resolve failing verifier report regarding missing empty state", expectedIntent: "fix" },
  ];

  it("correctly classifies all 20 diverse prompt samples to their intended role intent", () => {
    expect(samplePrompts.length).toBe(20);

    for (const { prompt, expectedIntent } of samplePrompts) {
      const decision = classifyIntentSync(prompt);
      expect(decision.intent).toBe(expectedIntent);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
      expect(decision.skills.length).toBeGreaterThan(0);
      expect(decision.model).toBeDefined();
    }
  });

  it("handles ambiguous or underspecified prompts with low confidence (< 0.7) defaulting to build with manual tier", () => {
    const ambiguousPrompts = [
      "hmm okay",
      "test",
      "...",
      "something else",
      "maybe later",
    ];

    for (const prompt of ambiguousPrompts) {
      const decision = classifyIntentSync(prompt);
      expect(decision.intent).toBe("build");
      expect(decision.confidence).toBeLessThan(0.7);
      expect(decision.tier).toBe("manual");
      expect(decision.reasoning).toContain("Ambiguous prompt with confidence < 0.7");
    }
  });

  it("routes the very first interaction on a brand new project without a spec to plan mode", () => {
    const decision = classifyIntentSync("I want to make a fitness tracking app", {
      isNewProject: true,
      hasSpec: false,
    });

    expect(decision.intent).toBe("plan");
    expect(decision.tier).toBe("manual");
    expect(decision.reasoning).toContain("new project triggers the Plan spec gate");
  });

  it("executes classification in well under 50ms", async () => {
    const startTime = performance.now();

    for (let i = 0; i < 50; i++) {
      classifyIntentSync("Create a responsive navigation drawer with dark mode");
    }

    const elapsed = performance.now() - startTime;
    // 50 classifications should take < 50ms total
    expect(elapsed).toBeLessThan(50);
  });
});
