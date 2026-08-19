import { describe, expect, it } from "vitest";
import {
  isFlutterTestFile,
  normalizeFlutterTestFile,
  parseFlutterMachineResults,
  parseFlutterTestCases,
} from "./flutter_tests";

describe("normalizeFlutterTestFile / isFlutterTestFile", () => {
  it("accepts Dart test files under test/ and integration_test/", () => {
    expect(normalizeFlutterTestFile("test/widget_test.dart")).toBe(
      "test/widget_test.dart",
    );
    expect(normalizeFlutterTestFile("integration_test/app_test.dart")).toBe(
      "integration_test/app_test.dart",
    );
    expect(
      normalizeFlutterTestFile("test/features/counter/counter_test.dart"),
    ).toBe("test/features/counter/counter_test.dart");
    expect(isFlutterTestFile("test/widget_test.dart")).toBe(true);
  });

  it("rejects traversal, flags, backslashes and wrong roots", () => {
    expect(normalizeFlutterTestFile("../widget_test.dart")).toBeNull();
    expect(normalizeFlutterTestFile("test/../widget_test.dart")).toBeNull();
    expect(normalizeFlutterTestFile("test/-x_test.dart")).toBeNull();
    expect(normalizeFlutterTestFile("tests/widget_test.dart")).toBeNull();
    expect(normalizeFlutterTestFile("test/not_a_test.dart")).toBe(
      "test/not_a_test.dart",
    );
    expect(normalizeFlutterTestFile("test\\widget_test.dart")).toBe(
      "test/widget_test.dart",
    );
  });
});

describe("parseFlutterTestCases", () => {
  it("extracts testWidgets and test titles with 1-based lines", () => {
    const source = [
      "import 'package:flutter_test/flutter_test.dart';",
      "",
      "void main() {",
      "  testWidgets('renders the counter', (tester) async {",
      "    await tester.pumpWidget(const MinimalApp());",
      "  });",
      "",
      "  group('math', () {",
      "    test('adds numbers', () {",
      "      expect(1 + 1, 2);",
      "    });",
      "  });",
      "}",
    ].join("\n");
    expect(parseFlutterTestCases(source)).toEqual([
      { title: "renders the counter", line: 4 },
      { title: "adds numbers", line: 9 },
    ]);
  });

  it("handles single-quoted and double-quoted titles", () => {
    const source = `void main() {
  test("double quoted", () {});
  testWidgets('single quoted', (_) {});
}`;
    expect(parseFlutterTestCases(source).map((t) => t.title)).toEqual([
      "double quoted",
      "single quoted",
    ]);
  });
});

describe("parseFlutterMachineResults", () => {
  const appPath = "/home/user/app";

  it("maps passing tests to passed file results with relative paths", () => {
    const output = [
      JSON.stringify({
        protocolVersion: "0.1.2",
        type: "suite",
        suite: { id: 0, path: `${appPath}/test/widget_test.dart` },
      }),
      JSON.stringify({
        type: "testStart",
        test: {
          id: 0,
          name: "renders the counter",
          suiteID: 0,
        },
      }),
      JSON.stringify({
        type: "testDone",
        testID: 0,
        result: "success",
        time: 123456,
      }),
    ].join("\n");

    const results = parseFlutterMachineResults(output, { appPath });
    expect(results).toEqual([
      {
        file: "test/widget_test.dart",
        status: "passed",
        error: undefined,
        tests: [
          {
            title: "renders the counter",
            status: "passed",
            durationMs: 123,
            error: undefined,
          },
        ],
      },
    ]);
  });

  it("marks failed tests as failed and attaches error text", () => {
    const output = [
      JSON.stringify({
        type: "suite",
        suite: { id: 1, path: `${appPath}/test/widget_test.dart` },
      }),
      JSON.stringify({
        type: "testStart",
        test: { id: 7, name: "broken test", suiteID: 1 },
      }),
      JSON.stringify({
        type: "error",
        testID: 7,
        error: "Expected: 2\nActual: 3",
        stackTrace: "#0 main.dart:12",
        isFailure: true,
      }),
      JSON.stringify({
        type: "testDone",
        testID: 7,
        result: "failure",
        time: 10,
      }),
    ].join("\n");

    const results = parseFlutterMachineResults(output, { appPath });
    expect(results[0].status).toBe("failed");
    expect(results[0].tests?.[0]?.status).toBe("failed");
    expect(results[0].error).toContain("Expected: 2");
  });

  it("filters to the target file for single-file runs", () => {
    const output = [
      JSON.stringify({
        type: "suite",
        suite: { id: 0, path: `${appPath}/test/a_test.dart` },
      }),
      JSON.stringify({
        type: "testStart",
        test: { id: 1, name: "a", suiteID: 0 },
      }),
      JSON.stringify({
        type: "testDone",
        testID: 1,
        result: "success",
        time: 1,
      }),
      JSON.stringify({
        type: "suite",
        suite: { id: 1, path: `${appPath}/test/b_test.dart` },
      }),
      JSON.stringify({
        type: "testStart",
        test: { id: 2, name: "b", suiteID: 1 },
      }),
      JSON.stringify({
        type: "testDone",
        testID: 2,
        result: "failure",
        time: 1,
      }),
    ].join("\n");

    const results = parseFlutterMachineResults(output, {
      appPath,
      targetFile: "test/a_test.dart",
    });
    expect(results.map((r) => r.file)).toEqual(["test/a_test.dart"]);
    expect(results[0].status).toBe("passed");
  });

  it("returns the whole suite when no target file is set", () => {
    const output = [
      JSON.stringify({
        type: "suite",
        suite: { id: 0, path: `${appPath}/test/a_test.dart` },
      }),
      JSON.stringify({
        type: "testStart",
        test: { id: 1, name: "a", suiteID: 0 },
      }),
      JSON.stringify({
        type: "testDone",
        testID: 1,
        result: "success",
        time: 1,
      }),
    ].join("\n");
    const results = parseFlutterMachineResults(output, { appPath });
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("test/a_test.dart");
  });
});
