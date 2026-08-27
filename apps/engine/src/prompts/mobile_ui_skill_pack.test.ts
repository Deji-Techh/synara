import { describe, expect, it } from "vitest";
import { constructLocalAgentPrompt } from "./local_agent_prompt";
import { CAIDE_MOBILE_UI_SKILL_PACK } from "./mobile_ui_skill_pack";
import {
  UI_LIBRARY,
  getUiReferenceContent,
} from "@/pro/main/ipc/handlers/local_agent/tools/read_ui_reference";
import { getSystemPromptForChatMode } from "./system_prompt";

const mandatoryMarkers = [
  "<mandatory-ui-ux-skill>",
  "CAIDE preview contract",
  "<skill_index>",
  "Available on-demand skills",
];

describe("CAIDE UI/UX mastery skill", () => {
  it("is slim — contains preview contract and skill index, not full skill bodies", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("name: world-class-ui-ux");
    for (const marker of mandatoryMarkers) {
      expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(marker);
    }
    // Heavy bodies must stay out of always-on prompt — only index remains
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("World-Class UI/UX Production Skill");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("## 0. Mission");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain(
      '<companion-skill name="Motion and Interaction">',
    );
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Motion and Interaction Contract");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Product Flow Contract");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Backend Production Contract");
  });

  it("exposes conditional guidance for single-screen utilities", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("single-screen utilities");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("SKIP persistent design-spec");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("final review");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("read_ui_reference");
  });

  it("requires distinct phone, landscape, and tablet compositions (via preview contract)", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("320x568");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("844x390");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("768x1024");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("1024x768");
  });

  it("ships an index of on-demand reference documents instead of inlining them", () => {
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("<ui-ux-reference-library>");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain("read_ui_reference");
    for (const [name, entry] of Object.entries(UI_LIBRARY)) {
      expect(CAIDE_MOBILE_UI_SKILL_PACK).toContain(`- ${name} (${entry.kind}):`);
    }
    // The heavy documents themselves must stay out of the always-on prompt.
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Product Archetype Decision Matrix");
    expect(CAIDE_MOBILE_UI_SKILL_PACK).not.toContain("# Screen Specification Template");
    expect(CAIDE_MOBILE_UI_SKILL_PACK.length).toBeLessThan(20_000);
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
  it("is always injected into the standard build agent with the slim index", () => {
    const prompt = getSystemPromptForChatMode({
      chatMode: "build",
      enableTurboEditsV2: false,
    });
    for (const marker of mandatoryMarkers) {
      expect(prompt).toContain(marker);
    }
    expect(prompt).toContain("<skill_index>");
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
      expect(prompt).toContain("<skill_index>");
      expect(prompt).toContain("<ui-ux-reference-library>");
    }
  });
});
