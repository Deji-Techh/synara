import { describe, expect, it } from "vitest";
import { constructLocalAgentPrompt } from "./local_agent_prompt";
import { CAIDE_MOBILE_UI_SKILL_PACK } from "./mobile_ui_skill_pack";
import { UI_LIBRARY, getUiReferenceContent } from "@/pro/main/ipc/handlers/local_agent/tools/read_ui_reference";
import { getSystemPromptForChatMode } from "./system_prompt";

const mandatoryMarkers = [
  "<mandatory-ui-ux-skill>",
  "World-Class UI/UX Production Skill",
  "## 0. Mission",
  "## 6. Full Production Workflow",
  "## 51. Final Directive",
  "Do not optimize for the appearance of design competence",
];

describe("CAIDE UI/UX mastery skill", () => {
  it("loads the permanent SKILL.md without its metadata frontmatter", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("name: world-class-ui-ux");
    for (const marker of mandatoryMarkers) {
      expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(marker);
    }
  });

  it("permanently wires production motion, product-flow, and backend skills", () => {
    for (const marker of [
      '<companion-skill name="Motion and Interaction">',
      '<companion-skill name="Product Flow">',
      '<companion-skill name="Backend Production">',
      "# Motion and Interaction Contract",
      "# Product Flow Contract",
      "# Backend Production Contract",
    ]) {
      expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(marker);
    }
  });

  it("requires distinct phone, landscape, and tablet compositions", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(
      "Responsive does not mean stretching or centering the same narrow phone column",
    );
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("844x390 phone landscape");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("768x1024 tablet portrait");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("1024x768 tablet landscape");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(
      "Do not finish a build or edit until responsive behavior is implemented",
    );
  });

  it("ships an index of on-demand reference documents instead of inlining them", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("<ui-ux-reference-library>");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("read_ui_reference");
    for (const [name, entry] of Object.entries(UI_LIBRARY)) {
      expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(`- ${name} (${entry.kind}):`);
    }
    // The heavy documents themselves must stay out of the always-on prompt.
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain(
      "# Product Archetype Decision Matrix",
    );
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Screen Specification Template");
    expect(CAIDE_MOBILE_UI_SKILL_PACK.length).toBeLessThan(120_000);
  });
});

describe("read_ui_reference library", () => {
  it("serves every indexed document", () => {
    for (const [name, entry] of Object.entries(UI_LIBRARY)) {
      const content = getUiReferenceContent(name);
      expect(content.length).toBeGreaterThan(0);
      if (entry.kind === "reference") {
        expect(content).toContain("# ");
      }
    }
  });

  it("throws for unknown document names", () => {
    expect(() => getUiReferenceContent("does-not-exist")).toThrow();
  });
});

describe("CAIDE UI/UX skill pack injection", () => {
  it("is always injected into the standard build agent with the reference index", () => {
    const prompt = getSystemPromptForChatMode({
      chatMode: "build",
      enableTurboEditsV2: false,
    });
    for (const marker of mandatoryMarkers) {
      expect(prompt).toContain(marker);
    }
    expect(prompt).toContain("<ui-ux-reference-library>");
  });

  it("is always injected into local and basic agent modes", () => {
    for (const prompt of [
      constructLocalAgentPrompt(undefined),
      constructLocalAgentPrompt(undefined, undefined, {
        basicAgentMode: true,
      }),
    ]) {
      for (const marker of mandatoryMarkers) {
        expect(prompt).toContain(marker);
      }
      expect(prompt).toContain("<ui-ux-reference-library>");
    }
  });
});
