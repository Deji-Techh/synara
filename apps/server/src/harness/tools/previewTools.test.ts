// FILE: previewTools.test.ts
// Purpose: Agent preview-control tools — structured behavior without
// spawning real dev servers (blank/website/RN-without-android paths).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "./defineTool.ts";
import { createDefaultRegistry } from "./registry.ts";
import {
  ALL_PREVIEW_TOOLS,
  buildApkTool,
  openPreviewTool,
  previewStatusTool,
} from "./previewTools.ts";

function ctxFor(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    toolId: "tool-test",
  };
}

function blankDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-blank-"));
}

describe("preview tools (agent preview control)", () => {
  it("registers all five preview tools in the default registry", () => {
    expect(ALL_PREVIEW_TOOLS.map((t) => t.name)).toEqual([
      "open_preview",
      "restart_preview",
      "preview_status",
      "stop_preview",
      "build_apk",
    ]);
    const registry = createDefaultRegistry();
    for (const name of ["open_preview", "restart_preview", "preview_status", "stop_preview", "build_apk"]) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it("open_preview refuses Blank explicitly instead of spawning", async () => {
    const out = (await openPreviewTool.execute({ port: undefined }, ctxFor(blankDir()))) as any;
    expect(out.started).toBe(false);
    expect(out.reason).toMatch(/Blank/);
  });

  it("preview_status reports idle cleanly with no session", async () => {
    const out = (await previewStatusTool.execute({ tail: 5 }, ctxFor(blankDir()))) as any;
    expect(out.running).toBe(false);
    expect(out.logs).toEqual([]);
  });

  it("build_apk is structured, never a crash, for website/blank/RN-without-shells", async () => {
    const blank = (await buildApkTool.execute({}, ctxFor(blankDir()))) as any;
    expect(blank.success).toBe(false);
    expect(blank.framework).toBe("blank");

    const rnDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-rn-"));
    fs.writeFileSync(
      path.join(rnDir, "package.json"),
      JSON.stringify({ dependencies: { expo: "*" } }),
    );
    const rn = (await buildApkTool.execute({}, ctxFor(rnDir))) as any;
    expect(rn.success).toBe(false);
    expect(rn.error).toMatch(/expo prebuild/);
  });
});
