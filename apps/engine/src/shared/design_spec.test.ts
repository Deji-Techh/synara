import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CaideDesignSpecSchema,
  DEFAULT_DESIGN_ENGINE_CONFIG,
  designSpecCompleteness,
} from "./design_spec";

function completeSpec() {
  const spec = JSON.parse(readFileSync(path.resolve("scaffold/.caide/design-spec.json"), "utf8"));
  spec.status = "approved";
  spec.product.name = "Campus";
  spec.product.archetype = "social";
  spec.product.primaryUser = "University students";
  spec.product.primaryGoal = "Share campus updates and coordinate student activities.";
  spec.product.coreActions = ["Read the feed", "Create a post", "Message a classmate"];
  spec.product.risks = ["Harassment and unwanted disclosure"];
  spec.direction.references.push({
    app: "Discord",
    purpose: "interaction",
    patternToStudy: "Fast switching between communities and conversations.",
    prohibitedCopying: ["branding", "icons"],
  });
  spec.screens.push({
    ...spec.screens[0],
    id: "composer",
    name: "Composer",
    route: "/compose",
    userGoal: "Publish a campus update with clear audience controls.",
  });
  spec.components.push(
    {
      ...spec.components[0],
      name: "PostRow",
      purpose: "Present author, context, content, media, and engagement actions.",
    },
    {
      ...spec.components[0],
      name: "BottomNavigation",
      purpose: "Switch between the primary application destinations.",
    },
  );
  return spec;
}

describe("CAIDE design specification", () => {
  it("accepts a complete production specification", () => {
    const parsed = CaideDesignSpecSchema.parse(completeSpec());
    expect(parsed.product.name).toBe("Campus");
    expect(designSpecCompleteness(parsed)).toBe(100);
  });

  it("rejects references that omit the anti-copying boundary", () => {
    const spec = completeSpec();
    spec.direction.references = [
      {
        app: "Example",
        purpose: "visual-character",
        patternToStudy: "A clear visual pattern.",
        prohibitedCopying: [],
      },
    ];
    expect(() => CaideDesignSpecSchema.parse(spec)).toThrow();
  });

  it("ships strict visual, motion, accessibility, and flow defaults", () => {
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.version).toBe(2);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.requireMotionSpecBeforeCode).toBe(true);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.qualityGates.minimumOverallScore).toBe(94);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.qualityGates.minimumMotionScore).toBe(92);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.qualityGates.minimumAccessibilityScore).toBe(95);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.qualityGates.minimumCoreFlowScore).toBe(98);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.qualityGates.maximumMajorIssues).toBe(0);
    expect(DEFAULT_DESIGN_ENGINE_CONFIG.componentPolicy.allowNestedCards).toBe(false);
  });
});
