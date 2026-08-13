// FILE: src/build/flutterTestParse.test.ts
import { describe, expect, it } from "vitest";

import { parseFlutterTestOutput } from "./flutterTestParse.ts";

describe("parseFlutterTestOutput", () => {
  it("extracts passed/failed counts from a failed run", () => {
    const output = [
      "00:00 +0: loading /app/test/widget_test.dart",
      "00:01 +2 -1: Some tests failed.",
    ].join("\n");
    expect(parseFlutterTestOutput(output)).toEqual({ passed: 2, failed: 1, skipped: 0 });
  });

  it("extracts passed+skipped from an all-pass run", () => {
    const output = [
      "00:00 +0: loading /app/test/widget_test.dart",
      "00:02 +3 ~1: All tests passed!",
    ].join("\n");
    expect(parseFlutterTestOutput(output)).toEqual({ passed: 3, failed: 0, skipped: 1 });
  });

  it("returns zeros for output with no counter lines", () => {
    expect(parseFlutterTestOutput("loading\n")).toEqual({ passed: 0, failed: 0, skipped: 0 });
  });
});
