// FILE: src/tools/flutterCommand.ts
// Purpose: Shared flutter binary resolution + command runner used by every
// flutter tool (create, analyze, test, run). Single source of truth for
// FLUTTER_SDK_BIN / FLUTTER_SDK_DIR / PATH resolution (plan decision E:
// pinned SDK) and for spawning with capture + timeout.
// Layer: Engine tool infra

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { safeFlutterEnvironment } from "../safeEnvironment.ts";

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

/** The resolved binary, or throws FlutterToolNotFoundError. */
export function requireFlutterBinary(): string {
  const binary = resolveFlutterBinary();
  if (!binary) {
    throw new FlutterToolNotFoundError();
  }
  return binary;
}

export interface FlutterCommandResult {
  /** Exit code (null = killed by signal). */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawns the flutter binary without waiting for exit — the long-running
 * counterpart to runFlutterCommand (flutter run, pub serve, etc.). Callers own
 * the child lifecycle (stop/kill) and the output plumbing.
 */
export function spawnFlutterProcess(
  args: string[],
  cwd: string,
  options: { binary?: string; env?: NodeJS.ProcessEnv } = {},
): ChildProcess {
  const binary = options.binary ?? requireFlutterBinary();
  return spawn(binary, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: options.env ?? safeFlutterEnvironment(),
  });
}

/**
 * Runs a flutter subcommand with output capture and a timeout. Rejects with a
 * descriptive error on spawn failure, timeout, or non-zero exit.
 */
export async function runFlutterCommand(
  args: string[],
  cwd: string,
  options: { timeoutMs?: number; binary?: string } = {},
): Promise<FlutterCommandResult> {
  const binary = options.binary ?? requireFlutterBinary();
  const timeoutMs = options.timeoutMs ?? 180_000;
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: safeFlutterEnvironment(),
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
          `flutter ${args.join(" ")} timed out after ${timeoutMs}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `flutter ${args.join(" ")} exited with code ${code === null ? "null" : code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}
