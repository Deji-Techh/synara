import { describe, expect, it } from "vitest";

import { DESIGN_ENGINE_CONTRACT } from "./design_engine_contract";

describe("design engine prompt contract", () => {
  it("requires persistent design and motion specifications for substantial UI, but skips for trivial utilities", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain(".caide/design-spec.json");
    expect(DESIGN_ENGINE_CONTRACT).toContain(".caide/motion-spec.json");
    expect(DESIGN_ENGINE_CONTRACT).toContain("before implementing substantial");
    expect(DESIGN_ENGINE_CONTRACT).toContain("single-screen utilities");
    expect(DESIGN_ENGINE_CONTRACT).toContain("SKIP this stage");
  });

  it("routes animation capabilities rather than installing every engine", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain('Install "motion"');
    expect(DESIGN_ENGINE_CONTRACT).toContain("@rive-app/react-webgl2");
    expect(DESIGN_ENGINE_CONTRACT).toContain("Never install");
    expect(DESIGN_ENGINE_CONTRACT).toContain("every engine pre-emptively");
  });

  it("defines single final review pass, not per-file multi-pass gate", () => {
    expect(DESIGN_ENGINE_CONTRACT).toContain("SINGLE final review");
    expect(DESIGN_ENGINE_CONTRACT).toContain("94");
    expect(DESIGN_ENGINE_CONTRACT).toContain("92 motion");
    expect(DESIGN_ENGINE_CONTRACT).toContain("critical");
    expect(DESIGN_ENGINE_CONTRACT).toContain("major");
  });
});
