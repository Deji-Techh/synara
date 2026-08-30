import { describe, it, expect, vi } from "vitest";
import {
  assemblePrompt,
  renderTemplateStrict,
  MissingPromptVariableError,
  resolveSkills,
  estimateTokenCount,
  type HarnessRole,
} from "./index.ts";

describe("Milestone M5 — Layered Prompt Registry (L0–L3)", () => {
  const allRoles: HarnessRole[] = ["builder", "verifier", "router", "planner", "fixer", "taste"];

  it("assemble() with all 6 roles produces non-empty, well-structured prompts without syntax errors", () => {
    for (const role of allRoles) {
      const prompt = assemblePrompt({
        role,
        stage: {
          stageName: "implementation",
          framework: "react-native",
          sliceIndex: 0,
          totalSlices: 3,
          availableArtifacts: [".caide/spec.md", "src/App.tsx"],
          exitGate: "Verifier passes with confidence >= 0.9",
        },
        framework: "react-native",
      });

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(300);
      expect(prompt).toContain("You are Caide");
      expect(prompt).toContain("Stage Context (Stage: implementation)");
      expect(prompt).toContain("Framework: react-native");
    }
  });

  it("renderTemplateStrict() correctly interpolates variables and throws MissingPromptVariableError on missing variable", () => {
    const template = "Project: {{projectName}}, Framework: {{framework}}, Owner: {{owner}}";

    // Valid interpolation
    const rendered = renderTemplateStrict(template, {
      projectName: "SupaApp",
      framework: "flutter",
      owner: "Deji",
    });
    expect(rendered).toBe("Project: SupaApp, Framework: flutter, Owner: Deji");

    // Missing variable 'owner'
    expect(() =>
      renderTemplateStrict(template, {
        projectName: "SupaApp",
        framework: "flutter",
      }),
    ).toThrowError(MissingPromptVariableError);

    // Verify error properties
    try {
      renderTemplateStrict("Missing {{secretKey}}", {});
    } catch (e: any) {
      expect(e).toBeInstanceOf(MissingPromptVariableError);
      expect(e.missingVar).toBe("secretKey");
      expect(e.message).toContain("Missing required prompt template variable: '{{secretKey}}'");
    }
  });

  it("triggers token budget warning when estimated prompt tokens exceed 90% of model limit", () => {
    let warningFired = false;
    let warnedTokens = 0;
    let warnedLimit = 0;

    // Create a scenario where limit is small (e.g. 500 tokens) and prompt exceeds 90% (450 tokens)
    assemblePrompt({
      role: "builder",
      stage: "building",
      framework: "website",
      modelContextLimit: 400,
      onBudgetWarning: (tokens, limit) => {
        warningFired = true;
        warnedTokens = tokens;
        warnedLimit = limit;
      },
    });

    expect(warningFired).toBe(true);
    expect(warnedTokens).toBeGreaterThan(360);
    expect(warnedLimit).toBe(400);
  });

  it("skill resolution returns appropriate skill packs based on role, stage, and framework", () => {
    // Builder on React Native gets UI/UX, Product Flow, Motion, Anti-Slop, Platform Patterns
    const builderSkills = resolveSkills("builder", "implementation", "react-native");
    expect(builderSkills.length).toBeGreaterThanOrEqual(4);
    expect(builderSkills.some((s) => s.includes("UI/UX Mastery"))).toBe(true);
    expect(builderSkills.some((s) => s.includes("Motion & Interaction"))).toBe(true);
    expect(builderSkills.some((s) => s.includes("Anti-AI Slop"))).toBe(true);

    // Verifier gets UI/UX, Anti-Slop, Motion for design verification
    const verifierSkills = resolveSkills("verifier", "verification", "website");
    expect(verifierSkills.some((s) => s.includes("UI/UX Mastery"))).toBe(true);
    expect(verifierSkills.some((s) => s.includes("Anti-AI Slop"))).toBe(true);

    // Fixer gets UI/UX and Backend Production for technical repair
    const fixerSkills = resolveSkills("fixer", "repair", "website");
    expect(fixerSkills.some((s) => s.includes("Backend Production"))).toBe(true);
  });
});
