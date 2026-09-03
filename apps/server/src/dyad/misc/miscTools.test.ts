// FILE: miscTools.test.ts
// Purpose: M2b gate — titles, compression fallback/injection, reference
// guards, evidence log, guide reader + framework filter.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  ALL_MISC_TOOLS,
  captureEvidenceTool,
  copyReferenceTool,
  executeCopyReference,
  executeReadGuide,
  executeSummarizeContext,
  getSessionTitle,
  listGuideNames,
  readGuideTool,
  setChatSummaryTool,
  setContextSummarizer,
  summarizeContextTool,
} from "./miscTools.ts";

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    toolId: "tool-test",
  };
}

describe("dyad misc tools transplant (m2b)", () => {
  it("registers all five misc tools with donor previews", () => {
    expect(ALL_MISC_TOOLS.map((t) => t.name)).toEqual([
      "set_chat_summary",
      "summarize_context",
      "copy_reference",
      "capture_evidence",
      "read_guide",
    ]);
    expect(setChatSummaryTool.presentCall?.({ summary: "Auth" })).toBe("Auth");
    expect(summarizeContextTool.presentCall?.({})).toBe("Compressing chat context...");
    expect(readGuideTool.presentCall?.({ guide: "provision-backend" })).toBe(
      "Read guide: provision-backend",
    );
    expect(
      captureEvidenceTool.presentCall?.({ kind: "test", label: "unit", passed: true }),
    ).toBe("Record test evidence: PASSED — unit");
  });

  it("stores chat titles per session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-misc-"));
    const ctx = toolCtx(dir);
    const out = await setChatSummaryTool.execute({ summary: "Todo app" }, ctx);
    expect(out).toBe("Chat summary set to: Todo app");
    expect(getSessionTitle(ctx.sessionId)).toBe("Todo app");
  });

  it("compresses extractively unwired, via model when wired, failing structured", async () => {
    setContextSummarizer(null);
    const fallback = await executeSummarizeContext({
      current_goal: "Build auth",
      active_files: ["a.ts"],
      context_to_compress: "x".repeat(5000),
    });
    expect(fallback).toContain("extractive fallback");
    expect(fallback).toContain("Goal: Build auth");

    setContextSummarizer(async () => "dense summary");
    try {
      const wired = await executeSummarizeContext({
        current_goal: "g",
        active_files: [],
        context_to_compress: "verbose",
      });
      expect(wired).toContain("[COMPRESSED CONTEXT]\ndense summary");
    } finally {
      setContextSummarizer(null);
    }

    setContextSummarizer(async () => {
      throw new Error("provider down");
    });
    try {
      await expect(
        executeSummarizeContext({ current_goal: "g", active_files: [], context_to_compress: "v" }),
      ).resolves.toMatch(/Failed to compress context: provider down/);
    } finally {
      setContextSummarizer(null);
    }
  });

  it("guards reference imports: sensitive paths, size, destination escapes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-misc-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "caide-outside-"));
    const src = path.join(outside, "ref.txt");
    fs.writeFileSync(src, "reference");
    const out = await copyReferenceTool.execute({ path: src }, toolCtx(dir));
    expect(out).toMatch(/Successfully copied file/);
    expect(fs.existsSync(path.join(dir, "ref.txt"))).toBe(true);

    await expect(executeCopyReference({ path: "/etc/hostname" }, dir)).rejects.toThrow(
      /restricted system path/,
    );
    await expect(executeCopyReference({ path: path.join(dir, "missing") }, dir)).rejects.toThrow(
      /not found/,
    );
    await expect(
      executeCopyReference({ path: src, destination: "../escape.txt" }, dir),
    ).rejects.toThrow(/escapes the project/);
    const dup = await executeCopyReference({ path: src, destination: "ref.txt" }, dir);
    expect(dup).toMatch(/already exists/);
  });

  it("appends evidence JSONL with revision best-effort", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-misc-"));
    const ctx = toolCtx(dir);
    const out = await captureEvidenceTool.execute(
      { kind: "test", label: "unit suite", reference: "bun run test", passed: true },
      ctx,
    );
    expect(out).toMatch(/Evidence recorded \(PASSED\): unit suite/);
    const lines = fs
      .readFileSync(path.join(dir, ".caide", "evidence", `${ctx.sessionId}.jsonl`), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ kind: "test", passed: true, label: "unit suite" });
    expect(entry.revision).toBeNull();
  });

  it("reads guides from disk with framework filtering", () => {
    expect(listGuideNames()).toContain("provision-backend");
    const guide = executeReadGuide({ guide: "provision-backend" });
    expect(guide.length).toBeGreaterThan(500);
    const vite = executeReadGuide({ guide: "provision-backend", framework: "website" });
    expect(typeof vite).toBe("string");
    expect(() => executeReadGuide({ guide: "nope" })).toThrow(/not found. Available guides/);
  });
});
