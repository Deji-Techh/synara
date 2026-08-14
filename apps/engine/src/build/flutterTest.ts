// FILE: src/build/flutterTest.ts
// Purpose: Runs `flutter test` in an app dir and returns structured results.
// Layer: Engine test service

import { runFlutterCommand } from "../tools/flutterCommand.ts";
import { parseFlutterTestOutput, type TestCounts } from "./flutterTestParse.ts";

export class RunFlutterTestError extends Error {}

export interface FlutterTestResult extends TestCounts {
  /** Raw `flutter test` output. */
  readonly output: string;
}

export async function runFlutterTest(
  appDir: string,
  testPath?: string,
): Promise<FlutterTestResult> {
  const args = ["test", ...(testPath ? [testPath] : [])];
  
  const result = await runFlutterCommand(args, appDir, { timeoutMs: 180_000 }).catch(
    (error) => ({
      code: 1 as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : `flutter test failed: ${String(error)}`,
    }),
  );

  const counts = parseFlutterTestOutput(result.stdout);
  return {
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    output: `${result.stdout}\n${result.stderr}`.trim(),
  };
}
