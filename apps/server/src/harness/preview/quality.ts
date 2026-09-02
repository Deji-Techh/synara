// FILE: harness/preview/quality.ts
// Runs the quality gates (analyze / test / build) for a thread's app dir and
// returns a structured result the web UI can render.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPreviewState } from "./manager.ts";

const execFileAsync = promisify(execFile);

export interface QualityResult {
  passed: boolean;
  issues: Array<{ severity: "error" | "warning"; message: string }>;
  output: string;
}

export async function runQualityCommand(
  threadId: string,
  kind: "analyze" | "test" | "build",
  appDir?: string,
): Promise<QualityResult> {
  // Prefer the active preview's working dir; fall back to the caller's appDir.
  const state = getPreviewState(threadId);
  const cwd = state.url ? undefined : undefined; // state has no appDir; resolve below
  void cwd;
  void state;

  const resolvedAppDir = appDir ?? process.cwd();

  let command = "bun";
  let args: string[];
  if (kind === "test") args = ["run", "test"];
  else if (kind === "build") args = ["run", "build"];
  else args = ["run", "typecheck"]; // analyze ≈ typecheck for JS/TS frameworks

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: resolvedAppDir,
      timeout: 120_000,
    });
    const output = `${stdout}\n${stderr}`.slice(0, 200_000);
    const failed = /error|failed|✘|Failed/i.test(output);
    return {
      passed: !failed,
      issues: failed ? [{ severity: "error", message: output.slice(0, 2000) }] : [],
      output,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return {
      passed: false,
      issues: [{ severity: "error", message: message.slice(0, 2000) }],
      output: message.slice(0, 200_000),
    };
  }
}
