// FILE: src/agent/tools/flutterTools.integration.test.ts
// Purpose: Proves the flutter_analyze / flutter_test tools run the real
// `flutter` binary (represented by a fake shim on PATH) in the app directory,
// surface non-zero exits as tool output (not thrown errors), and return
// results to the model through the agent loop's tool-call protocol.
// Layer: Engine integration test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupEngineHarness, type EngineHarness } from "../../testing/engineHarness.ts";
import { flutterAnalyzeTool, flutterTestTool } from "./flutterTools.ts";

const FLUTTER_SHIM = `#!/bin/sh
if [ "$1" = "analyze" ]; then
  if [ -f "$PWD/analyze_fail" ]; then
    echo "error - The method 'foo' isn't defined" >&2
    exit 1
  fi
  echo "No issues found!"
  exit 0
fi
if [ "$1" = "test" ]; then
  if [ -f "$PWD/test_fail" ]; then
    echo "FAILED widget_test.dart" >&2
    exit 1
  fi
  echo "All tests passed!"
  exit 0
fi
echo "usage: flutter <subcommand>" >&2
exit 2
`;

describe("agent flutter tools", () => {
  let harness: EngineHarness;
  let shimDir: string;
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fluttertools-"));
    shimDir = path.join(tempRoot, "shimbin");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(path.join(shimDir, "flutter"), FLUTTER_SHIM, { mode: 0o755 });

    const preExistingPath = process.env.PATH ?? "";
    process.env.PATH = `${shimDir}${path.delimiter}${preExistingPath}`;
    // Scaffold a fake app so the tools have an appDir with pubspec.yaml.
    fs.mkdirSync(path.join(tempRoot, "app", "lib"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "app", "pubspec.yaml"), "name: hello_app\n", "utf8");

    harness = await setupEngineHarness({
      tools: [flutterAnalyzeTool, flutterTestTool],
      toolContext: { appDir: path.join(tempRoot, "app") },
      seedFiles: {
        "lib/main.dart": "void main() {}\n",
      },
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
    const savedPath = process.env.PATH ?? "";
    process.env.PATH = savedPath.replace(`${shimDir}${path.delimiter}`, "");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("runs flutter analyze and reports success to the model", async () => {
    const result = await harness.runTurn("[call_tool=flutter_analyze:{}]");
    expect(result.toolCalls.map((call) => call.name)).toEqual(["flutter_analyze"]);
    expect(result.text).toContain("hello world from the caide engine fake LLM");
  }, 30_000);

  it("surfaces analyzer failures as tool output for the model to fix", async () => {
    const failMarker = path.join(tempRoot, "app", "analyze_fail");
    fs.writeFileSync(failMarker, "", "utf8");
    try {
      const result = await harness.runTurn("[call_tool=flutter_analyze:{}]");
      expect(result.text).toContain("isn't defined");
    } finally {
      fs.rmSync(failMarker, { force: true });
    }
  }, 30_000);

  it("runs flutter test and reports pass/fail", async () => {
    const pass = await harness.runTurn("[call_tool=flutter_test:{}]");
    expect(pass.toolCalls.map((call) => call.name)).toEqual(["flutter_test"]);

    const failMarker = path.join(tempRoot, "app", "test_fail");
    fs.writeFileSync(failMarker, "", "utf8");
    try {
      const fail = await harness.runTurn("[call_tool=flutter_test:{}]");
      expect(fail.text).toContain("FAILED widget_test.dart");
    } finally {
      fs.rmSync(failMarker, { force: true });
    }
  }, 30_000);
});
