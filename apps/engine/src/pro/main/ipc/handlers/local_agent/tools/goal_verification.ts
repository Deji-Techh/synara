import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { spawn } from "node:child_process";
import { buildTool, type AgentContext, escapeXmlAttr, escapeXmlContent } from "./types";
import { PersistedGoalStateSchema, PersistedGoalEvidenceSchema } from "@/shared/goal_state";
import { getCurrentCommitHash } from "@/ipc/utils/git_utils";
import { getCaideAppPath } from "@/paths/paths";
import { isFlutterApp } from "@/ipc/utils/flutter_utils";

// ============================================================================
// Shared helpers
// ============================================================================

const MAX_OUTPUT_CHARS = 10_000;

function truncateOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return `...[truncated]\n${s.slice(-MAX_OUTPUT_CHARS)}`;
}

function spawnCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn("sh", ["-c", command], {
      cwd,
      env: { ...process.env, TERM: "dumb", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
      });
    });
  });
}

/**
 * Detect the test runner from package.json scripts.
 * Returns the npm script name to run.
 */
async function detectTestCommand(appPath: string): Promise<string> {
  if (isFlutterApp(appPath)) {
    return "flutter test";
  }
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(appPath, "package.json"), "utf8"));
    const scripts: Record<string, string> = pkgJson.scripts ?? {};

    // Prefer explicit 'test' script if defined and non-trivial
    if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return "npm run test";
    }
    // Look for common test scripts
    for (const name of ["test:run", "test:unit", "vitest:run"]) {
      if (scripts[name]) return `npm run ${name}`;
    }
    // Detect installed test runners
    const deps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };
    if (deps["vitest"]) return "npx vitest run";
    if (deps["jest"]) return "npx jest --passWithNoTests";
  } catch {
    // No package.json or can't read it
  }
  return "npm run test";
}

/**
 * Detect the lint command from package.json scripts.
 */
async function detectLintCommand(appPath: string): Promise<string> {
  if (isFlutterApp(appPath)) {
    return "flutter analyze";
  }
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(appPath, "package.json"), "utf8"));
    const scripts: Record<string, string> = pkgJson.scripts ?? {};
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

    for (const name of ["lint", "check", "lint:check"]) {
      if (scripts[name]) return `npm run ${name}`;
    }
    if (deps["@biomejs/biome"]) return "npx biome check src/";
    if (deps["eslint"]) return "npx eslint src/ --max-warnings 0";
  } catch {
    // ignore
  }
  return "npm run lint";
}

// ============================================================================
// run_tests
// ============================================================================

const runTestsSchema = z.object({
  test_pattern: z
    .string()
    .optional()
    .describe(
      "Optional glob/regex pattern to filter which test files to run. Omit to run all tests.",
    ),
  timeout_seconds: z
    .number()
    .min(30)
    .max(300)
    .optional()
    .default(120)
    .describe("Max seconds to wait (default 120, max 300)"),
  command_override: z
    .string()
    .optional()
    .describe(
      "Override the auto-detected test command. Use this when the project uses an unusual test setup.",
    ),
});

export const runTestsTool = buildTool({
  name: "run_tests",
  description: `Run the project's test suite and return pass/fail results.
Auto-detects the test runner (vitest, jest) from package.json.
Returns a summary: exit code, number of passing/failing tests, and any error output.

Use this to:
- Verify your changes don't break existing tests
- Generate test evidence for an active Goal
- Confirm a bug fix works

After running, use capture_evidence to record the result in the active Goal.`,
  inputSchema: runTestsSchema,
  defaultConsent: "ask",
  isReadOnly: true,

  getConsentPreview: (args) =>
    args.command_override
      ? `$ ${args.command_override}`
      : `Run test suite${args.test_pattern ? ` (pattern: ${args.test_pattern})` : ""}`,

  execute: async (args, ctx: AgentContext) => {
    let command = args.command_override ?? (await detectTestCommand(ctx.appPath));
    if (args.test_pattern) {
      command = `${command} ${args.test_pattern}`;
    }

    ctx.onXmlStream(
      `<caide-status title="Running tests: ${escapeXmlAttr(command)}"></caide-status>`,
    );

    const { stdout, stderr, exitCode, timedOut } = await spawnCommand(
      command,
      ctx.appPath,
      (args.timeout_seconds ?? 120) * 1000,
    );

    const parts: string[] = [];
    if (timedOut) {
      parts.push(`[TIMED OUT after ${args.timeout_seconds ?? 120}s]`);
    } else {
      parts.push(`Exit code: ${exitCode} — Tests ${exitCode === 0 ? "PASSED ✓" : "FAILED ✗"}`);
    }
    if (stdout) parts.push(`OUTPUT:\n${truncateOutput(stdout)}`);
    if (stderr) parts.push(`STDERR:\n${truncateOutput(stderr)}`);

    const result = parts.join("\n\n");
    const status = exitCode === 0 && !timedOut ? "finished" : "aborted";

    ctx.onXmlComplete(
      `<caide-status title="Tests: ${exitCode === 0 && !timedOut ? "PASSED" : "FAILED"}" state="${status}">\n${escapeXmlContent(result)}\n</caide-status>`,
    );

    return result;
  },
});

// ============================================================================
// run_lint
// ============================================================================

const runLintSchema = z.object({
  timeout_seconds: z
    .number()
    .min(10)
    .max(180)
    .optional()
    .default(60)
    .describe("Max seconds to wait (default 60)"),
  command_override: z.string().optional().describe("Override the auto-detected lint command"),
});

export const runLintTool = buildTool({
  name: "run_lint",
  description: `Run the project's linter (biome, eslint) and return any issues found.
Auto-detects the linter from package.json.
Returns exit code and lint output.
Use after making code changes to ensure code quality.`,
  inputSchema: runLintSchema,
  defaultConsent: "ask",
  isReadOnly: true,

  getConsentPreview: (args) =>
    args.command_override ? `$ ${args.command_override}` : "Run linter",

  execute: async (args, ctx: AgentContext) => {
    const command = args.command_override ?? (await detectLintCommand(ctx.appPath));

    ctx.onXmlStream(
      `<caide-status title="Running lint: ${escapeXmlAttr(command)}"></caide-status>`,
    );

    const { stdout, stderr, exitCode, timedOut } = await spawnCommand(
      command,
      ctx.appPath,
      (args.timeout_seconds ?? 60) * 1000,
    );

    const parts: string[] = [];
    if (timedOut) {
      parts.push(`[TIMED OUT after ${args.timeout_seconds ?? 60}s]`);
    } else {
      parts.push(`Exit code: ${exitCode} — Lint ${exitCode === 0 ? "PASSED ✓" : "FAILED ✗"}`);
    }
    if (stdout) parts.push(`OUTPUT:\n${truncateOutput(stdout)}`);
    if (stderr) parts.push(`STDERR:\n${truncateOutput(stderr)}`);

    const result = parts.join("\n\n");
    const status = exitCode === 0 && !timedOut ? "finished" : "aborted";

    ctx.onXmlComplete(
      `<caide-status title="Lint: ${exitCode === 0 && !timedOut ? "PASSED" : "FAILED"}" state="${status}">\n${escapeXmlContent(result)}\n</caide-status>`,
    );

    return result;
  },
});

// ============================================================================
// capture_evidence
// ============================================================================

const captureEvidenceSchema = z.object({
  goalId: z.string().min(1).describe("The ID of the active Goal to record evidence for"),
  taskId: z
    .string()
    .nullable()
    .optional()
    .describe("Optional: the task ID this evidence relates to"),
  kind: PersistedGoalEvidenceSchema.shape.kind.describe(
    "The kind of evidence: test | build | typecheck | lint | screenshot | audit-report | file-change | command-output | deployment | manual-confirmation | other",
  ),
  label: z
    .string()
    .min(1)
    .describe("Human-readable description of the evidence, e.g. 'vitest: 47/47 tests passed'"),
  reference: z
    .string()
    .min(1)
    .describe(
      "The command run or artifact path, e.g. 'npm run test' or '.caide/evidence/screenshot.png'",
    ),
  passed: z.boolean().describe("Whether this evidence indicates the check passed"),
});

export const captureEvidenceTool = buildTool({
  name: "capture_evidence",
  description: `Record a piece of verification evidence into an active Goal's state.json.
Use this after running a check (tests, type checks, lint, build) to persist the outcome as verifiable evidence.

This is the mechanism by which the Goal system accepts completion — the goal scheduler validates
that required tasks have passing evidence before marking the goal as complete.

Always capture_evidence after run_tests, run_lint, or run_type_checks when working on a Goal.`,
  inputSchema: captureEvidenceSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) =>
    `Record ${args.kind} evidence for goal ${args.goalId}: ${args.passed ? "PASSED" : "FAILED"} — ${args.label}`,

  execute: async (args, ctx: AgentContext) => {
    const appPath = getCaideAppPath(ctx.appPath);
    const stateFile = path.join(appPath, ".caide", "goals", args.goalId, "state.json");

    let rawState: unknown;
    try {
      rawState = JSON.parse(await fs.readFile(stateFile, "utf8"));
    } catch (err) {
      return `ERROR: Could not read goal state for ${args.goalId}: ${err instanceof Error ? err.message : String(err)}`;
    }

    const parseResult = PersistedGoalStateSchema.safeParse(rawState);
    if (!parseResult.success) {
      return `ERROR: Goal state schema validation failed: ${parseResult.error.message}`;
    }

    const state = parseResult.data;

    // Get current commit hash as the revision
    let revision: string | null = null;
    try {
      revision = await getCurrentCommitHash({ path: ctx.appPath });
    } catch {
      // Best-effort
    }

    const evidence = {
      id: crypto.randomUUID(),
      taskId: args.taskId ?? null,
      kind: args.kind,
      label: args.label,
      reference: args.reference,
      passed: args.passed,
      revision,
      createdAt: Date.now(),
    };

    const updatedState = {
      ...state,
      evidence: [...state.evidence, evidence],
      updatedAt: Date.now(),
    };

    // Write atomically
    const tempFile = `${stateFile}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(updatedState, null, 2), "utf8");
    await fs.rename(tempFile, stateFile);

    return `Evidence recorded for goal ${args.goalId}:\n  kind: ${args.kind}\n  label: ${args.label}\n  passed: ${args.passed}\n  revision: ${revision ?? "(unknown)"}\n  id: ${evidence.id}`;
  },
});
