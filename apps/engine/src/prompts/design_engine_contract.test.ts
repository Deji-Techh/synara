import { describe, expect, it } from "vitest";

import { DESIGN_ENGINE_CONTRACT } from "./design_engine_contract";

describe("design engine prompt contract", () => {
  it("requires persistent design and motion specifications before substantial UI code", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain(".caide/design-spec.json");
    expect(DESIGN_ENGINE_CONTRACT).toContain(".caide/motion-spec.json");
    expect(DESIGN_ENGINE_CONTRACT).toContain("before implementing substantial");
  });

  it("routes animation capabilities rather than installing every engine", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain('Install "motion"');
    expect(DESIGN_ENGINE_CONTRACT).toContain("@rive-app/react-webgl2");
    expect(DESIGN_ENGINE_CONTRACT).toContain("Never install");
    expect(DESIGN_ENGINE_CONTRACT).toContain("every engine pre-emptively");
  });

  it("defines strict visual, motion, accessibility, and core-flow gates", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain("94/100 overall");
    expect(DESIGN_ENGINE_CONTRACT).toContain("92 motion");
    expect(DESIGN_ENGINE_CONTRACT).toContain("zero critical issues, zero");
    expect(DESIGN_ENGINE_CONTRACT).toContain("major issues, at most five");
    expect(DESIGN_ENGINE_CONTRACT).toContain("three review passes");
  });
});
