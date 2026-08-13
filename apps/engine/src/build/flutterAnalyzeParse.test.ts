// FILE: src/build/flutterAnalyzeParse.test.ts
import { describe, expect, it } from "vitest";

import { parseFlutterAnalyze } from "./flutterAnalyzeParse.ts";

describe("parseFlutterAnalyze", () => {
  it("parses bullet-format analyzer lines with severity/path/line/column/code", () => {
    const output = [
      "Analyzing lib...",
      "",
      "  info • Use const with static invocation • lib/main.dart:3:12 • prefer_const_constructors",
      "",
      "1 issue found.",
    ].join("\n");
    const { issues, issueCount } = parseFlutterAnalyze(output);
    expect(issueCount).toBe(1);
    expect(issues[0]).toEqual({
      severity: "info",
      message: "Use const with static invocation",
      path: "lib/main.dart",
      line: 3,
      column: 12,
      code: "prefer_const_constructors",
    });
  });

  it("parses bracket-format error lines", () => {
    const output = [
      "Analyzing lib...",
      "",
      "  error - The argument type 'String' can't be assigned - lib/main.dart:5:18 - argument_type_not_assignable",
      "",
      "1 error found.",
    ].join("\n");
    const { issues } = parseFlutterAnalyze(output);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.line).toBe(5);
    expect(issues[0]?.code).toBe("argument_type_not_assignable");
  });

  it("returns no issues for clean runs", () => {
    const { issues, issueCount } = parseFlutterAnalyze("Analyzing lib...\n\nNo issues found!\n");
    expect(issueCount).toBe(0);
    expect(issues).toEqual([]);
  });
});
