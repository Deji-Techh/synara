// FILE: src/tools/flutterCreate.ts
// Purpose: The `flutter create` scaffold tool — the engine's first real tool
// (plan milestone M2). Runs the REAL `flutter create` binary (org dev.caide,
// platforms android+ios+web) in a workspace and writes an AI_RULES.md contract
// the agent loop follows while building the app.
// Layer: Engine tool

import fs from "node:fs";
import path from "node:path";

import { FlutterToolNotFoundError, runFlutterCommand } from "./flutterCommand.ts";

export { FlutterToolNotFoundError, resolveFlutterBinary } from "./flutterCommand.ts";

export const DEFAULT_FLUTTER_ORG = "dev.caide";
export const DEFAULT_FLUTTER_PLATFORMS = ["android", "ios", "web"] as const;

export const FLUTTER_AI_RULES = `# AI_RULES.md

Contract for AI agent builds in this app (Synara Flutter Builder engine).

- Always run \`flutter analyze\` before considering a change done; fix all reported issues.
- Run \`flutter test\` after any logic change; keep all tests green.
- Prefer Material 3 widgets and the app's existing theme; do not reinvent styling.
- Keep pub dependencies minimal; run \`flutter pub add\` / \`flutter pub remove\` for changes.
- Never commit build artifacts (build/, .dart_tool/) to git.
`;

export interface FlutterCreateOptions {
  /** Workspace (repo root) the app is created in. */
  readonly cwd: string;
  /** App/project name, e.g. "hello_app" (must be a valid Dart package name). */
  readonly name: string;
  readonly org?: string;
  readonly platforms?: readonly string[];
  /** Override binary resolution (tests pass a shim here). */
  readonly flutterBinary?: string;
  readonly timeoutMs?: number;
}

export interface FlutterCreateResult {
  readonly projectPath: string;
  /** Captured stdout+stderr of the flutter create invocation. */
  readonly output: string;
}

/**
 * Runs `flutter create` for a new app and writes AI_RULES.md. Resolves with the
 * created project path. Rejects with a descriptive error if the binary is
 * missing, the command fails, or it times out.
 */
export async function createFlutterApp(options: FlutterCreateOptions): Promise<FlutterCreateResult> {
  const org = options.org ?? DEFAULT_FLUTTER_ORG;
  const platforms = options.platforms ?? DEFAULT_FLUTTER_PLATFORMS;
  const projectPath = path.join(options.cwd, options.name);
  const args = [
    "create",
    "--org",
    org,
    "--platforms",
    platforms.join(","),
    options.name,
  ];

  const result = await runFlutterCommand(args, options.cwd, {
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.flutterBinary !== undefined ? { binary: options.flutterBinary } : {}),
  });

  fs.writeFileSync(path.join(projectPath, "AI_RULES.md"), FLUTTER_AI_RULES, "utf8");

  return { projectPath, output: `${result.stdout}\n${result.stderr}`.trim() };
}