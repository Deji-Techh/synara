import { describe, it, expect } from "vitest";
import * as schema from "./schema";

describe("db schema", () => {
  it("exports users table", () => {
    expect(schema.users).toBeDefined();
    expect(schema.users.name).toBe("users");
  });
});
