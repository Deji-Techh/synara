// FILE: problems.ts
// Purpose: TypeScript problem report for an app workspace (Problems
// checklist backend + run_type_checks agent tool).
// Donor: dyad x caide src/ipc/processors/tsc.ts (precondition kinds +
// guidance verbatim; generateProblemReport semantics) — execution adapted:
// V1 ran tsc inside an Electron utilityProcess (own V8 heap cage so OOM
// degrades to a failed check). The server port runs tsc as a child process
// with the same timeout/degrade contract; the worker_threads re-homing
// (with the documented cage-equivalent safeguard) is 016 work.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TypeCheckPreconditionKind = "typescript-not-found" | "tsconfig-not-found";

export class TypeCheckPreconditionError extends Error {
  readonly kind: TypeCheckPreconditionKind;
  constructor(kind: TypeCheckPreconditionKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TypeCheckPreconditionError";
    this.kind = kind;
  }
}

const TSC_TIMEOUT_MS = 5 * 60_000;
const MAX_PROBLEMS = 200;

export interface CodeProblem {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ProblemReport {
  problems: CodeProblem[];
}

function getStringMatchedPreconditionKind(message: string): TypeCheckPreconditionKind | undefined {
  if (
    message.startsWith("Failed to load TypeScript from") ||
    message.includes("Cannot find module 'typescript'")
  ) {
    return "typescript-not-found";
  }
  if (message.startsWith("No TypeScript configuration file found")) {
    return "tsconfig-not-found";
  }
  return undefined;
}

export function getTypeCheckPreconditionKind(error: unknown): TypeCheckPreconditionKind | undefined {
  if (error instanceof TypeCheckPreconditionError) return error.kind;
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return getStringMatchedPreconditionKind(message);
}

async function packageJsonDeclaresTypeScript(appPath: string): Promise<boolean> {
  try {
    const raw = await fs.promises.readFile(path.join(appPath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return (
      parsed.dependencies?.["typescript"] !== undefined ||
      parsed.devDependencies?.["typescript"] !== undefined
    );
  } catch {
    return false;
  }
}

export async function getTypeCheckPreconditionGuidance({
  kind,
  appPath,
  includeAgentInstructions,
}: {
  kind: TypeCheckPreconditionKind;
  appPath: string;
  includeAgentInstructions?: boolean;
}): Promise<string> {
  if (kind === "tsconfig-not-found") {
    return "Type checking could not run: TypeScript is installed but no tsconfig was found (expected `tsconfig.app.json` or `tsconfig.json`). You can create a suitable tsconfig for this project and retry.";
  }
  const declaresTypeScript = await packageJsonDeclaresTypeScript(appPath);
  if (declaresTypeScript) {
    if (!includeAgentInstructions) {
      return "Type checking could not run: TypeScript is listed in package.json but is not installed (node_modules is missing or incomplete). Install dependencies, then retry.";
    }
    return "Type checking could not run: TypeScript is listed in package.json but is not installed (node_modules is missing or incomplete). Tell the user to Rebuild to reinstall dependencies, then retry `run_type_checks`.";
  }
  return includeAgentInstructions
    ? "Type checking is unavailable: this project does not use TypeScript (no `typescript` entry in package.json). Do not call `run_type_checks` again in this conversation. Verify your changes by reading the files instead. At the end of your reply, recommend that the user add TypeScript to the project so you can automatically catch and fix type errors."
    : "Type checking is unavailable: this project does not use TypeScript (no `typescript` entry in package.json). Add TypeScript to enable automatic type checking.";
}

/** Donor tsconfig preference parity (016): tsconfig.app.json wins. */
export async function resolveTsconfig(appPath: string): Promise<string | null> {
  for (const name of ["tsconfig.app.json", "tsconfig.json"]) {
    try {
      await fs.promises.access(path.join(appPath, name), fs.constants.R_OK);
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

const TSC_LINE_PATTERN = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

/** Parse `tsc --noEmit` stdout into problems (bounded). Exported for tests. */
export function parseTscOutput(output: string, appPath: string): CodeProblem[] {
  const problems: CodeProblem[] = [];
  for (const line of output.split("\n")) {
    if (problems.length >= MAX_PROBLEMS) break;
    const match = line.match(TSC_LINE_PATTERN);
    if (!match) continue;
    const [, file, lineNo, colNo, code, message] = match;
    if (!file || !lineNo || !colNo || !code) continue;
    problems.push({
      file: path.relative(appPath, path.resolve(appPath, file)) || file,
      line: Number(lineNo),
      column: Number(colNo),
      code,
      message: (message ?? "").trim(),
      severity: "error",
    });
  }
  return problems;
}

/**
 * Donor generateProblemReport parity ({ fullResponse, appPath }): runs the
 * project TypeScript compiler and returns structured problems. Precondition
 * failures throw TypeCheckPreconditionError (guidance via
 * getTypeCheckPreconditionGuidance); compiler success with no output means
 * zero problems.
 */
export async function generateProblemReport({
  appPath,
  signal,
}: {
  fullResponse?: string;
  appPath: string;
  signal?: AbortSignal;
}): Promise<ProblemReport> {
  const tsconfig = await resolveTsconfig(appPath);
  if (!tsconfig) {
    throw new TypeCheckPreconditionError(
      "tsconfig-not-found",
      "No TypeScript configuration file found",
    );
  }
  let stdout = "";
  try {
    const result = await execFileAsync("npx", ["tsc", "--noEmit", "-p", tsconfig], {
      cwd: appPath,
      timeout: TSC_TIMEOUT_MS,
      signal,
      maxBuffer: 20 * 1024 * 1024,
    });
    stdout = `${result.stdout}\n${result.stderr}`;
  } catch (err: any) {
    // tsc exits non-zero when errors exist — that IS the report, not a crash.
    const out = `${err?.stdout ?? ""}\n${err?.stderr ?? ""}`;
    if (out.trim()) {
      return { problems: parseTscOutput(out, appPath) };
    }
    const kind = getStringMatchedPreconditionKind(err?.message ?? String(err));
    if (kind === "typescript-not-found") {
      throw new TypeCheckPreconditionError(kind, "Cannot find module 'typescript'", {
        cause: err,
      });
    }
    if (/ENOENT/i.test(err?.message ?? "")) {
      throw new TypeCheckPreconditionError(
        "typescript-not-found",
        "Cannot find module 'typescript'",
        { cause: err },
      );
    }
    throw err;
  }
  return { problems: parseTscOutput(stdout, appPath) };
}
