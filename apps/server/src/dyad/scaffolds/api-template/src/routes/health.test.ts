import { describe, it, expect } from "vitest";

describe("health routes", () => {
  it("exports healthRoutes", async () => {
    const mod = await import("./health");
    expect(mod.healthRoutes).toBeDefined();
  });
});
