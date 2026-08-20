import { describe, expect, it } from "vitest";

import { buildSandboxFailureMessage, classifySandboxFailure } from "./failure_message";

describe("sandbox failure messages", () => {
  it("classifies directory reads as host-function failures", () => {
    const error = "CAIDEError: Path is not a file: src/components/layout/";

    expect(classifySandboxFailure(error)).toBe("host-function");
    expect(
      buildSandboxFailureMessage({
        script: "await read_file(path);",
        errorMessage: error,
      }),
    ).toContain('directory entries ending in "/"');
    expect(
      buildSandboxFailureMessage({
        script: "await read_file(path);",
        errorMessage: error,
      }),
    ).not.toContain("This script contains unsupported syntax");
  });

  it("keeps actual parser failures classified as syntax errors", () => {
    expect(classifySandboxFailure("SyntaxError: Unexpected token class")).toBe("syntax");
  });

  it("classifies timeouts separately", () => {
    expect(classifySandboxFailure("Sandbox script timed out after 3000ms")).toBe("timeout");
  });
});
