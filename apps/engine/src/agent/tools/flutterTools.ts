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

export const pubAddTool = defineTool({
  name: "pub_add",
  description:
    "Add one or more packages to the Flutter project (e.g. `flutter pub add flutter_riverpod google_fonts`).",
  parameters: z.object({
    packages: z
      .array(z.string())
      .describe("List of package names to add, e.g. ['flutter_riverpod', 'go_router']"),
    dev: z.boolean().optional().describe("Whether to add as dev_dependencies (defaults to false)"),
  }),
  async execute(args, context) {
    const cmd = ["pub", "add", ...(args.dev ? ["--dev"] : []), ...args.packages];
    const result = await runFlutterCommand(cmd, context.appDir, {
      timeoutMs: 120_000,
      ...(context.flutterBinary !== undefined && { binary: context.flutterBinary }),
    }).catch((error) => ({
      code: 1 as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    return `flutter pub add: exit ${result.code}\n${result.stdout}\n${result.stderr}`.trim();
  },
});

export const pubRemoveTool = defineTool({
  name: "pub_remove",
  description: "Remove one or more packages from pubspec.yaml.",
  parameters: z.object({
    packages: z.array(z.string()).describe("List of package names to remove"),
  }),
  async execute(args, context) {
    const cmd = ["pub", "remove", ...args.packages];
    const result = await runFlutterCommand(cmd, context.appDir, {
      timeoutMs: 120_000,
      ...(context.flutterBinary !== undefined && { binary: context.flutterBinary }),
    }).catch((error) => ({
      code: 1 as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    return `flutter pub remove: exit ${result.code}\n${result.stdout}\n${result.stderr}`.trim();
  },
});

export const runCommandTool = defineTool({
  name: "run_command",
  description:
    "Run a safe command inside the workspace or app directory (e.g. dart format, git, or custom scripts).",
  parameters: z.object({
    command: z.string().describe("Command to run"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory for the command (defaults to app)"),
    timeoutMs: z
      .number()
      .optional()
      .describe("Command timeout in milliseconds (defaults to 60000)"),
  }),
  async execute(args, context) {
    const path = await import("node:path");

    const commandToRun = args.command.trim();
    const firstToken = commandToRun.split(/\s+/)[0];
    const allowedBinaries = ["flutter", "dart", "pub", "git", "pod"];
    
    if (!firstToken || !allowedBinaries.includes(firstToken)) {
      return `Error: Command '${firstToken}' is not on the allowlist. Allowed commands are: ${allowedBinaries.join(", ")}.`;
    }

    if (/[&|;<>$`\\]/.test(commandToRun)) {
      return `Error: Command contains forbidden shell characters.`;
    }

    let workingDir = context.appDir;
    if (args.cwd) {
      if (args.cwd === "workspace") {
        workingDir = context.workspaceDir;
      } else if (args.cwd === "app") {
        workingDir = context.appDir;
      } else {
        // Resolve custom paths relative to workspaceDir
        workingDir = path.resolve(context.workspaceDir, args.cwd);
      }
    }

    const targetDir = path.resolve(workingDir);
    const workspaceDir = path.resolve(context.workspaceDir);
    const appDir = path.resolve(context.appDir);

    const isInside = (dir: string, parent: string) => {
      const relative = path.relative(parent, dir);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    };

    if (!isInside(targetDir, workspaceDir) && !isInside(targetDir, appDir)) {
      return `Error: Directory jail violation. Target cwd (${targetDir}) is outside the workspace.`;
    }

    const timeout = args.timeoutMs ?? 60_000;
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(commandToRun, {
        cwd: targetDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });
      return `${stdout}\n${stderr}`.trim() || "(command succeeded with no output)";
    } catch (err: any) {
      return `Command failed (exit ${err.code ?? 1}):\n${err.stdout ?? ""}\n${err.stderr ?? err.message}`.trim();
    }
  },
});

export const flutterTools: readonly ToolDefinition<any>[] = [
  flutterAnalyzeTool,
  flutterTestTool,
  pubAddTool,
  pubRemoveTool,
  runCommandTool,
];
