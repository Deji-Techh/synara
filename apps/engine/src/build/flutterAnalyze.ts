// FILE: src/build/flutterAnalyze.ts
// Purpose: Runs `flutter analyze` in an app dir and returns structured issues
// for the Problems pane. Reuses runFlutterCommand (the same probe the agent
// loop's flutter_analyze tool runs), then parses the text output.
// Layer: Engine analyze service

import { runFlutterCommand } from "../tools/flutterCommand.ts";

import { parseFlutterAnalyze, type AnalyzeIssue } from "./flutterAnalyzeParse.ts";

export class RunFlutterAnalyzeError extends Error {}

export interface FlutterAnalyzeResult {
  readonly issues: readonly AnalyzeIssue[];
  /** true when `flutter analyze` exited 0 (no issues). */
  readonly clean: boolean;
  /** Raw analyzer output. */
  readonly output: string;
}

/**
 * Runs `flutter analyze` with capture. Resolves on exit code 0 or non-zero
 * (analyze returns 2 when it finds issues); rejects only on spawn/timeout
 * failures (flutter missing, SDK not pinned).
 */
export async function runFlutterAnalyze(appDir: string): Promise<FlutterAnalyzeResult> {
  const result = await runFlutterCommand(["analyze"], appDir, { timeoutMs: 120_000 }).catch(
    (error) => {
      throw new RunFlutterAnalyzeError(
        error instanceof Error ? error.message : `flutter analyze failed: ${String(error)}`,
      );
    },
  );
  const { issues } = parseFlutterAnalyze(result.stdout);
  return { issues, clean: result.code === 0 && issues.length === 0, output: result.stdout };
}
