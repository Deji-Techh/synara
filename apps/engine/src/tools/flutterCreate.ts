// FILE: src/tools/flutterCreate.ts
// Purpose: The `flutter create` scaffold tool — the engine's first real tool
// (plan milestone M2). Runs the REAL `flutter create` binary (org dev.caide,
// platforms android+ios+web) in a workspace and writes an AI_RULES.md contract
// the agent loop follows while building the app.
// Layer: Engine tool

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

export class FlutterToolNotFoundError extends Error {
  constructor() {
    super(
      "flutter binary not found: set FLUTTER_SDK_DIR (decision E: pinned SDK) or " +
        "put `flutter` on PATH",
    );
  }
}

/** Resolves the flutter binary: FLUTTER_SDK_BIN, then FLUTTER_SDK_DIR/bin/flutter, then PATH. */
export function resolveFlutterBinary(): string | null {
  const explicit = process.env.FLUTTER_SDK_BIN;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }
  const sdkDir = process.env.FLUTTER_SDK_DIR;
  if (sdkDir) {
    const candidate = path.join(sdkDir, "bin", "flutter");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir === "") {
      continue;
    }
    for (const name of ["flutter", "flutter.bat", "flutter.exe"]) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

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
  const binary = options.flutterBinary ?? resolveFlutterBinary();
  if (!binary) {
    throw new FlutterToolNotFoundError();
  }

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

  const output = await runFlutterCommand(binary, args, options.cwd, options.timeoutMs ?? 180_000);

  fs.writeFileSync(path.join(projectPath, "AI_RULES.md"), FLUTTER_AI_RULES, "utf8");

  return { projectPath, output };
}

function runFlutterCommand(
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `flutter create timed out after ${timeoutMs}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`.trim();
      if (code !== 0) {
        reject(
          new Error(
            `flutter create exited with code ${code === null ? "null" : code}\n${combined}`,
          ),
        );
        return;
      }
      resolve(combined);
    });
  });
}