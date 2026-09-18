// FILE: typecheckTool.ts
// Purpose: run_type_checks agent tool over the problems backend.
// Donor: dyad x caide run_type_checks tool (description scope rules,
// consent, previews) + problems_handlers.checkProblems (report path).

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import {
  generateProblemReport,
  getTypeCheckPreconditionGuidance,
  getTypeCheckPreconditionKind,
  TypeCheckPreconditionError,
} from "./problems.ts";

const runTypeChecksSchema = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe(
      "Optional files or directories to scope the check to. Omit to check the whole workspace.",
    ),
});

function formatReport(
  fileFilter: string[] | undefined,
  problems: Array<{ file: string; line: number; column: number; code: string; message: string }>,
): string {
  const scoped =
    fileFilter && fileFilter.length > 0
      ? problems.filter((p) => fileFilter.some((f) => p.file === f || p.file.startsWith(`${f}/`)))
      : problems;
  if (scoped.length === 0) return "Type check clean: 0 problems.";
  const lines = scoped.map((p) => `${p.file}(${p.line},${p.column}): ${p.code}: ${p.message}`);
  return `Type check found ${scoped.length} problem(s):\n${lines.join("\n")}`;
}

export const runTypeChecksTool = defineTool({
  name: "run_type_checks",
  description: `Run TypeScript type checks on the current workspace. You can provide paths to specific files or directories, or omit the argument to get diagnostics for all files.

- If a file path is provided, returns diagnostics for that file only
- If a directory path is provided, returns diagnostics for all files within that directory
- If no path is provided, returns diagnostics for all files in the workspace
- This tool can return type errors that were already present before your edits, so avoid calling it with a very wide scope of files
- NEVER call this tool on a file unless you've edited it or are about to edit it`,
  schema: runTypeChecksSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = runTypeChecksSchema.parse(args);
    try {
      const report = await generateProblemReport({ appPath: ctx.appPath, signal: ctx.signal });
      return formatReport(parsed.paths, report.problems);
    } catch (error) {
      const kind = getTypeCheckPreconditionKind(error);
      if (kind) {
        return getTypeCheckPreconditionGuidance({
          kind,
          appPath: ctx.appPath,
          includeAgentInstructions: true,
        });
      }
      if (error instanceof TypeCheckPreconditionError) {
        return error.message;
      }
      throw error;
    }
  },
  presentCall: (args: any) =>
    args.paths && args.paths.length > 0
      ? `Check types for: ${args.paths.join(", ")}`
      : "Check types for all files",
});

export const ALL_TYPECHECK_TOOLS: ToolDef[] = [runTypeChecksTool];
