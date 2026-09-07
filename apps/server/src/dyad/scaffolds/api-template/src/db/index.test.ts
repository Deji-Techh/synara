import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "./schema";

describe("db schema", () => {
  it("exports users table", () => {
    expect(schema.users).toBeDefined();
    expect(getTableName(schema.users)).toBe("users");
  });
});
