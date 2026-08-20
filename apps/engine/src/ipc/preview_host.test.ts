// FILE: src/ipc/preview_host.test.ts
// Purpose: Unit + focused integration coverage for the engine's preview RPC
// host (see preview_host.ts). Pure helpers are unit-tested directly; router
// paths that don't need a live flutter process are exercised in-process. The
// analyze/run integration test builds a throwaway Flutter fixture in a temp
// dir and runs pub get + dart analyze, so it's skipped when flutter is absent.
// Layer: Engine protocol handler test
// NOTE: spawns `flutter`/`dart` child processes from the Vitest worker; the
// repo runs Vitest with a forks pool so this is supported.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  aggregateTestCounts,
  appendLogLines,
  createPreviewJsonRpcRouter,
  extractPreviewUrl,
  parseAnalyzeIssues,
  runFlutterPubGet,
} from "./preview_host";
import { getFlutterExecutable } from "@/ipc/utils/flutter_utils";

function flutterAvailable(): boolean {
  try {
    const probe = spawnSync(getFlutterExecutable(), ["--version"], {
      timeout: 10_000,
      stdio: "ignore",
      env: { ...process.env, CI: "1", TERM: "dumb" },
    });
    return probe.status === 0;
  } catch {
    return false;
  }
}

const HAS_FLUTTER = flutterAvailable();

/** Create a minimal valid Flutter package in a fresh temp dir. */
function makeFixture(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-preview-fixture-"));
}

function writeFixtureApp(appDir: string): void {
  fs.writeFileSync(
    path.join(appDir, "pubspec.yaml"),
    [
      "name: preview_fixture_app",
      "description: engine preview test fixture",
      "publish_to: none",
      "version: 0.1.0",
      "environment:",
      "  sdk: ^3.0.0",
      "dependencies:",
      "  flutter:",
      "    sdk: flutter",
      "",
    ].join("\n"),
  );
  fs.mkdirSync(path.join(appDir, "lib"));
  fs.writeFileSync(
    path.join(appDir, "lib", "main.dart"),
    "void main() {\n  print(missingSymbol);\n}\n",
  );
}

function cleanupFixture(appDir: string): void {
  fs.rmSync(appDir, { recursive: true, force: true });
}

describe("parseAnalyzeIssues", () => {
  const appPath = "/home/user/app";

  it("maps ERROR/WARNING/INFO machine lines with severity and relative paths", () => {
    const output = [
      "Analyzing lib...",
      "ERROR|COMPILE_TIME_ERROR|UNDEFINED_IDENTIFIER|lib/main.dart|2|9|13|Undefined name 'missingSymbol'.",
      "WARNING|info|unused_local_variable|lib/main.dart|3|7|1|The value of the local variable 'unused' isn't used.",
      "INFO|lint|prefer_const_constructors|lib/main.dart|4|5|1|Prefer const with constant constructors.",
      "1 issue found.",
    ].join("\n");

    expect(parseAnalyzeIssues(output, appPath)).toEqual([
      {
        severity: "error",
        path: "lib/main.dart",
        line: 2,
        column: 9,
        message: "UNDEFINED_IDENTIFIER: Undefined name 'missingSymbol'.",
      },
      {
        severity: "warning",
        path: "lib/main.dart",
        line: 3,
        column: 7,
        message: "unused_local_variable: The value of the local variable 'unused' isn't used.",
      },
      {
        severity: "info",
        path: "lib/main.dart",
        line: 4,
        column: 5,
        message: "prefer_const_constructors: Prefer const with constant constructors.",
      },
    ]);
  });

  it("prepends the rule name when the machine code is non-numeric", () => {
    const output = "WARNING|hint|avoid_print|lib/main.dart|1|3|4|Avoid print calls.";
    expect(parseAnalyzeIssues(output, appPath)[0]?.message).toBe("avoid_print: Avoid print calls.");
  });

  it("ignores non-machine lines", () => {
    expect(parseAnalyzeIssues("Analyzing...\nNo issues found!\n", appPath)).toEqual([]);
  });
});

describe("aggregateTestCounts", () => {
  it("counts per-test statuses across files", () => {
    const results = [
      {
        file: "test/a_test.dart",
        status: "failed" as const,
        tests: [
          { title: "ok", status: "passed" as const },
          { title: "bad", status: "failed" as const },
          { title: "todo", status: "inconclusive" as const },
        ],
      },
      {
        file: "test/b_test.dart",
        status: "passed" as const,
        tests: [{ title: "ok2", status: "passed" as const }],
      },
    ];
    expect(aggregateTestCounts(results)).toEqual({
      passed: 2,
      failed: 1,
      skipped: 1,
    });
  });

  it("falls back to file-level status when a file has no per-test detail", () => {
    const results = [
      { file: "test/x_test.dart", status: "passed" as const },
      { file: "test/y_test.dart", status: "failed" as const },
    ];
    expect(aggregateTestCounts(results)).toEqual({
      passed: 1,
      failed: 1,
      skipped: 0,
    });
  });

  it("returns zero counts for no results", () => {
    expect(aggregateTestCounts([])).toEqual({ passed: 0, failed: 0, skipped: 0 });
  });
});

describe("appendLogLines / extractPreviewUrl", () => {
  it("caps the rolling log buffer at 200 newest lines", () => {
    const logs: string[] = [];
    appendLogLines(logs, Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n"));
    expect(logs).toHaveLength(200);
    expect(logs[0]).toBe("line 50");
    expect(logs[199]).toBe("line 249");
  });

  it("extracts a URL for the requested port and strips trailing punctuation", () => {
    expect(extractPreviewUrl("The web server is listening on http://localhost:8080/.", 8080)).toBe(
      "http://localhost:8080",
    );
    expect(extractPreviewUrl("is being served at", 8080)).toBeNull();
    expect(extractPreviewUrl("http://localhost:9999/", 8080)).toBeNull();
  });
});

describe("preview RPC router (no live flutter)", () => {
  const router = createPreviewJsonRpcRouter();

  it("recognizes the preview/analyze/test/build methods", () => {
    for (const method of [
      "preview/start",
      "preview/stop",
      "preview/reload",
      "preview/state",
      "preview/screenshot",
      "analyze/run",
      "test/run",
      "build/start",
      "build/state",
    ]) {
      expect(router.isPreviewMethod(method)).toBe(true);
    }
    expect(router.isPreviewMethod("no/such/method")).toBe(false);
    expect(router.isPreviewMethod("dyad/invoke")).toBe(false);
  });

  it("preview/state returns idle defaults for an unknown appDir", async () => {
    await expect(
      router.handle("preview/state", { appDir: "/tmp/does-not-exist" }),
    ).resolves.toEqual({ running: false, url: "", logs: [] });
  });

  it("preview/stop returns stopped=false for an unknown appDir", async () => {
    await expect(router.handle("preview/stop", { appDir: "/tmp/does-not-exist" })).resolves.toEqual(
      { stopped: false },
    );
  });

  it("preview/reload returns reloaded=false when nothing is running", async () => {
    await expect(
      router.handle("preview/reload", { appDir: "/tmp/does-not-exist", hotReload: true }),
    ).resolves.toEqual({ reloaded: false });
  });

  it("preview/screenshot is a best-effort no-op", async () => {
    await expect(router.handle("preview/screenshot", {})).resolves.toEqual({
      success: false,
      outputPath: "",
    });
  });

  it("build/state rejects an unknown buildId", async () => {
    await expect(router.handle("build/state", { buildId: "nope" })).rejects.toThrow(
      /unknown buildId/,
    );
  });

  it("rejects invalid params with a zod error", async () => {
    await expect(router.handle("preview/state", {})).rejects.toThrow();
  });
});

describe("analyze/run integration (real flutter)", () => {
  const maybe = HAS_FLUTTER ? it : it.skip;
  const fixture = makeFixture();
  writeFixtureApp(fixture);

  maybe(
    "runs pub get + dart analyze and returns protocol issues",
    { timeout: 120_000 },
    async () => {
      const router = createPreviewJsonRpcRouter();
      try {
        const result = (await router.handle("analyze/run", {
          appDir: fixture,
        })) as {
          issues: {
            severity: string;
            path: string;
            line?: number;
            column?: number;
            message: string;
          }[];
          output: string;
        };
        expect(Array.isArray(result.issues)).toBe(true);
        expect(result.output).toBeTypeOf("string");
        expect(
          result.issues.some(
            (issue) => issue.severity === "error" && issue.message.includes("missingSymbol"),
          ),
        ).toBe(true);
        expect(result.issues.some((issue) => issue.path === "lib/main.dart")).toBe(true);
      } finally {
        cleanupFixture(fixture);
      }
    },
  );

  maybe("runFlutterPubGet resolves a fresh package", { timeout: 120_000 }, async () => {
    const appDir = makeFixture();
    writeFixtureApp(appDir);
    try {
      await expect(runFlutterPubGet(appDir)).resolves.toBeUndefined();
      expect(fs.existsSync(path.join(appDir, ".dart_tool", "package_config.json"))).toBe(true);
    } finally {
      cleanupFixture(appDir);
    }
  });
});
