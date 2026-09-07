import { describe, it, expect } from "vitest";

// Health module validates env on import; dummy values isolate the test.
process.env.DATABASE_URL ??= "postgres://test/test";
process.env.NEON_AUTH_SECRET ??= "test-secret-0123456789abcdef01234567";

describe("health routes", () => {
  it("exports healthRoutes", async () => {
    const mod = await import("./health");
    expect(mod.healthRoutes).toBeDefined();
  });
});
