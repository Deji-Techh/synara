// FILE: problems.test.ts
// Purpose: tsc output parsing + precondition guidance (no compiler needed).

import { describe, expect, it } from "vitest";
import {
  getTypeCheckPreconditionGuidance,
  getTypeCheckPreconditionKind,
  parseTscOutput,
  resolveTsconfig,
  TypeCheckPreconditionError,
} from "./problems.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("problems backend", () => {
  it("parses tsc error lines into problems", () => {
    const problems = parseTscOutput(
      [
        "src/a.ts(3,12): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/b.ts(1,1): error TS1005: ';' expected.",
        "not an error line",
      ].join("\n"),
      "/app",
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({
      file: "src/a.ts",
      line: 3,
      column: 12,
      code: "TS2322",
      severity: "error",
    });
  });

  it("classifies precondition failures", () => {
    expect(
      getTypeCheckPreconditionKind(new TypeCheckPreconditionError("tsconfig-not-found", "x")),
    ).toBe("tsconfig-not-found");
    expect(getTypeCheckPreconditionKind(new Error("Cannot find module 'typescript'"))).toBe(
      "typescript-not-found",
    );
    expect(
      getTypeCheckPreconditionKind(new Error("No TypeScript configuration file found for x")),
    ).toBe("tsconfig-not-found");
    expect(getTypeCheckPreconditionKind(new Error("unrelated boom"))).toBeUndefined();
  });

  it("guides on missing typescript without agent instructions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-prob-"));
    const guidance = await getTypeCheckPreconditionGuidance({
      kind: "typescript-not-found",
      appPath: dir,
    });
    expect(guidance).toContain("does not use TypeScript");
  });

  it("prefers tsconfig.app.json", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-prob-"));
    expect(await resolveTsconfig(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
    fs.writeFileSync(path.join(dir, "tsconfig.app.json"), "{}");
    expect(await resolveTsconfig(dir)).toBe("tsconfig.app.json");
  });
});
