// FILE: src/agent/tools/flutterTools.ts
// Purpose: Flutter toolchain tools for the engine agent loop: flutter_analyze
// and flutter_test (plan milestone M3). Both run the real `flutter` binary in
// the app directory and report exit-code + captured output; the agent loop
// uses them as quality gates while building apps.
// Layer: Engine agent tools

import { z } from "zod";

import { runFlutterCommand } from "../../tools/flutterCommand.ts";
import { defineTool, type ToolDefinition } from "../tool.ts";

export const flutterAnalyzeTool = defineTool({
  name: "flutter_analyze",
  description:
    "Run `flutter analyze` in the app. Exit code 0 means no issues; a " +
    "non-zero exit reports the analyzer output (errors/warnings with line " +
    "numbers). Run this before considering a change done.",
  parameters: z.object({}),
  async execute(_args, context) {
    const result = await runFlutterCommand(["analyze"], context.appDir, {
      timeoutMs: 120_000,
      ...(context.flutterBinary !== undefined && { binary: context.flutterBinary }),
    }).catch((error) => ({
      // flutter analyze exits non-zero when it finds issues; surface that as
      // tool output (the loop can then fix the issues), not a thrown error.
      code: 1 as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    return `flutter analyze: exit ${result.code}\n${result.stdout}\n${result.stderr}`.trim();
  },
});

export const flutterTestTool = defineTool({
  name: "flutter_test",
  description:
    "Run `flutter test` in the app. Exit code 0 means all tests pass; a " +
    "non-zero exit reports failing tests and their output. Run after any " +
    "logic change.",
  parameters: z.object({
    testPath: z
      .string()
      .optional()
      .describe("Optional path to a single test file to run (relative to app root)"),
  }),
  async execute(args, context) {
    const command = ["test", ...(args.testPath ? [args.testPath] : [])];
    const result = await runFlutterCommand(command, context.appDir, {
      timeoutMs: 120_000,
      ...(context.flutterBinary !== undefined && { binary: context.flutterBinary }),
    }).catch((error) => ({
      code: 1 as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    return `flutter test: exit ${result.code}\n${result.stdout}\n${result.stderr}`.trim();
  },
});

export const flutterTools: readonly ToolDefinition<any>[] = [flutterAnalyzeTool, flutterTestTool];
