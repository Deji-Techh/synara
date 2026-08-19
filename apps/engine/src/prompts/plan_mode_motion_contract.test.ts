import { describe, expect, it } from "vitest";

import { PLAN_MODE_SYSTEM_PROMPT } from "./plan_mode_prompt";

describe("plan mode design and motion contract", () => {
  it("requires visual direction, screen specifications, and a motion storyboard", () => {
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Visual Direction");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Screen Specifications");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Motion Storyboard");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("Asset Plan");
  });

  it("requires both persistent specifications and measurable gates", () => {
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain(".caide/design-spec.json");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain(".caide/motion-spec.json");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("92 motion");
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("zero major issues");
  });

  it("does not permit exiting plan mode with missing motion decisions", () => {
    expect(PLAN_MODE_SYSTEM_PROMPT).toContain("do not call `exit_plan` until");
  });
});
