// FILE: src/tools/flutterCreate.test.ts
// Purpose: Unit tests for the flutter create scaffold tool. No real Flutter
// SDK is needed: a fake `flutter` shim script mimics what `flutter create`
// writes, so the tool's arg construction, AI_RULES.md contract, error paths,
// and binary resolution are all exercised deterministically.
// Layer: Engine tool test

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createFlutterApp,
  FlutterToolNotFoundError,
  resolveFlutterBinary,
} from "./flutterCreate.ts";

let tempRoot: string;
let workspaceDir: string;
let shimDir: string;

function writeShim(script: string): string {
  const shimPath = path.join(
    shimDir,
    `flutter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.writeFileSync(shimPath, script, { mode: 0o755 });
  return shimPath;
}

/**
 * A realistic fake `flutter create`: captures args to a log file, then writes
 * the minimal files the real command produces (project dir named by the last
 * arg, broken pubspec, empty main.dart).
 */
function buildShim(argsLog: string): string {
  return writeShim(
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > "${argsLog}"`,
      'NAME_USED="${@: -1}"',
      'PROJECT="$PWD/$NAME_USED"',
      'mkdir -p "$PROJECT/lib" "$PROJECT/test"',
      'printf \'name: %s\\ndescription: scaffolded by the caide engine\\n\' "$NAME_USED" > "$PROJECT/pubspec.yaml"',
      "printf 'void main() {}\\\n' > \"$PROJECT/lib/main.dart\"",
      "printf 'void main() {}\\\n' > \"$PROJECT/test/widget_test.dart\"",
      `echo "Creating project $NAME_USED..."`,
      "exit 0",
    ].join("\n"),
  );
}

describe("flutter create scaffold tool", () => {
  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caide-flutter-tool-"));
    workspaceDir = path.join(tempRoot, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    shimDir = path.join(tempRoot, "shimbin");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(path.join(shimDir, "flutter"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  });

  afterAll(() => {
    delete process.env.FLUTTER_SDK_BIN;
    delete process.env.FLUTTER_SDK_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("resolves the flutter binary from PATH", () => {
    const oldPath = process.env.PATH;
    delete process.env.FLUTTER_SDK_BIN;
    delete process.env.FLUTTER_SDK_DIR;
    process.env.PATH = `${shimDir}${path.delimiter}${oldPath ?? ""}`;
    try {
      expect(resolveFlutterBinary()).not.toBeNull();
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("resolves the flutter binary from FLUTTER_SDK_DIR/bin/flutter", () => {
    const oldSdk = process.env.FLUTTER_SDK_DIR;
    delete process.env.FLUTTER_SDK_BIN;
    fs.mkdirSync(path.join(tempRoot, "sdk", "bin"), { recursive: true });
    const sdkFlutter = path.join(tempRoot, "sdk", "bin", "flutter");
    fs.writeFileSync(sdkFlutter, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    process.env.FLUTTER_SDK_DIR = path.join(tempRoot, "sdk");
    try {
      expect(resolveFlutterBinary()).toBe(sdkFlutter);
    } finally {
      if (oldSdk !== undefined) process.env.FLUTTER_SDK_DIR = oldSdk;
      else delete process.env.FLUTTER_SDK_DIR;
    }
  });

  it("returns null when flutter is nowhere to be found", () => {
    const oldPath = process.env.PATH;
    delete process.env.FLUTTER_SDK_BIN;
    delete process.env.FLUTTER_SDK_DIR;
    process.env.PATH = "/nonexistent-bin-dir";
    try {
      expect(resolveFlutterBinary()).toBeNull();
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("runs flutter create with the org/platforms defaults and writes AI_RULES.md", async () => {
    const argsLog = path.join(tempRoot, "args.log");
    const shim = buildShim(argsLog);

    const result = await createFlutterApp({
      cwd: workspaceDir,
      name: "hello_app",
      flutterBinary: shim,
    });

    expect(result.projectPath).toBe(path.join(workspaceDir, "hello_app"));
    expect(result.output).toContain("Creating project hello_app");
    for (const relativePath of [
      "pubspec.yaml",
      "lib/main.dart",
      "test/widget_test.dart",
      "AI_RULES.md",
    ]) {
      expect(fs.existsSync(path.join(workspaceDir, "hello_app", relativePath))).toBe(true);
    }
    const aiRules = fs.readFileSync(path.join(workspaceDir, "hello_app", "AI_RULES.md"), "utf8");
    expect(aiRules).toContain("flutter analyze");
    expect(aiRules).toContain("flutter test");

    // Args: create --org dev.caide --platforms android,ios,web hello_app
    const args = fs.readFileSync(argsLog, "utf8").trim().split("\n");
    expect(args).toEqual([
      "create",
      "--org",
      "dev.caide",
      "--platforms",
      "android,ios,web",
      "hello_app",
    ]);
  });

  it("honours custom org and platforms", async () => {
    const argsLog = path.join(tempRoot, "args2.log");
    const shim = buildShim(argsLog);

    const result = await createFlutterApp({
      cwd: workspaceDir,
      name: "widget_app",
      org: "com.example",
      platforms: ["android", "web"],
      flutterBinary: shim,
    });

    expect(result.projectPath).toBe(path.join(workspaceDir, "widget_app"));
    const args = fs.readFileSync(argsLog, "utf8").trim().split("\n");
    expect(args[2]).toBe("com.example");
    expect(args[4]).toBe("android,web");
  });

  it("throws FlutterToolNotFoundError when no binary is available", async () => {
    const oldPath = process.env.PATH;
    delete process.env.FLUTTER_SDK_BIN;
    delete process.env.FLUTTER_SDK_DIR;
    process.env.PATH = "/nonexistent-bin-dir";
    try {
      await expect(createFlutterApp({ cwd: workspaceDir, name: "x" })).rejects.toThrow(
        FlutterToolNotFoundError,
      );
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("rejects with captured output when flutter exits non-zero", async () => {
    const failingShim = writeShim(
      [
        "#!/bin/sh",
        'mkdir -p "$PWD/$6"',
        "printf 'some stdout\\n' >&1",
        "printf 'BOOM: pubspec validation failed\\n' >&2",
        "exit 1",
      ].join("\n"),
    );

    await expect(
      createFlutterApp({ cwd: workspaceDir, name: "bad_app", flutterBinary: failingShim }),
    ).rejects.toThrow(/exited with code 1[\s\S]*BOOM: pubspec validation failed/);
  });
});
