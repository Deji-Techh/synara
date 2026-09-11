// FILE: reviewBarrier.test.ts
// Purpose: Reviewer verdict parsing/formatting + skip paths (non-repo,
// clean tree) without invoking an LLM.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearEvidenceMissStreak,
  diffTouchesUi,
  formatIssuesForEvent,
  getEvidenceMissStreak,
  parseVerdict,
  recordEvidenceOutcome,
  runReviewBarrier,
  TASTE_BAR,
} from "./reviewBarrier.ts";

describe("review barrier", () => {
  it("parses reviewer JSON verdicts with clamping", () => {
    const clean = parseVerdict(
      'noise {"passed": true, "confidence": 90, "tasteScore": 80, "issues": []} tail',
    );
    expect(clean).toEqual({ passed: true, confidence: 90, tasteScore: 80, issues: [] });

    const bad = parseVerdict(
      JSON.stringify({
        passed: true,
        confidence: 999,
        tasteScore: -5,
        issues: [
          { severity: "blocker", file: "a.ts", detail: "d", suggestion: "s" },
          { severity: "weird", file: "", detail: "x" },
          { note: "no detail" },
        ],
      }),
    );
    expect(bad.passed).toBe(false);
    expect(bad.confidence).toBe(100);
    expect(bad.tasteScore).toBe(0);
    expect(bad.issues).toHaveLength(2);
    expect(bad.issues[1].severity).toBe("minor");

    const prose = parseVerdict("looks fine, no blockers... wait, blocker found");
    expect(prose.passed).toBe(false);
    expect(parseVerdict("all good").passed).toBe(true);
    expect(parseVerdict("{not json").passed).toBe(true);
  });

  it("formats issues for the verifier event contract", () => {
    expect(
      formatIssuesForEvent([{ severity: "major", file: "a.ts", detail: "d", suggestion: "s" }]),
    ).toEqual(["[major] a.ts — d → s"]);
    expect(formatIssuesForEvent([])).toEqual([]);
  });

  it("exposes the taste bar constant", () => {
    expect(TASTE_BAR).toBe(60);
  });

  it("skips clean trees and non-repos with null", async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "caide-norepo-"));
    await expect(
      runReviewBarrier({
        appPath: plain,
        sessionId: "s",
        taskSummary: "t",
        llm: { async *stream() {} },
        tools: [],
      }),
    ).resolves.toBeNull();
  });

  it("detects UI touches and tracks evidence-miss streaks (item 1)", () => {
    expect(diffTouchesUi("diff --git a/src/screens/Home.tsx b/src/screens/Home.tsx\n+++ b/src/screens/Home.tsx")).toBe(true);
    expect(diffTouchesUi("diff --git a/src/db/schema.ts b/src/db/schema.ts\n+++ b/src/db/schema.ts")).toBe(false);
    expect(diffTouchesUi("")).toBe(false);
    const sid = `s-ev-${Date.now()}`;
    expect(getEvidenceMissStreak(sid)).toBe(0);
    expect(recordEvidenceOutcome(sid, true)).toBe(1);
    expect(recordEvidenceOutcome(sid, true)).toBe(2);
    expect(recordEvidenceOutcome(sid, false)).toBe(0);
    expect(getEvidenceMissStreak(sid)).toBe(0);
    clearEvidenceMissStreak(sid);
  });
});
