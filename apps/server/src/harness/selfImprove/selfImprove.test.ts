import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectLogStore, type ProjectRunLog } from "./index.ts";

describe("Milestone M26 — Self-Improving Loop & Cross-Project Learning", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-selfimprove-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("appends project run logs to JSONL and reads them back correctly", async () => {
    const store = new ProjectLogStore(tempDir);

    const log1: ProjectRunLog = {
      projectId: "proj-1",
      framework: "react-native",
      skills: ["ui-ux-mastery", "motion-interaction"],
      verifierPassRate: 0.95,
      fixerRetryCount: 1,
      tasteScore: 0.9,
      benchmarkScore: 0.88,
      edgeCasesFound: ["missing_data"],
      timestamp: Date.now(),
    };

    await store.appendLog(log1);
    const logs = await store.readLogs();

    expect(logs.length).toBe(1);
    expect(logs[0].projectId).toBe("proj-1");
    expect(logs[0].verifierPassRate).toBe(0.95);
  });

  it("identifies recurring failures and ranks skill combinations across mock projects", () => {
    const mockLogs: ProjectRunLog[] = [
      {
        projectId: "proj-1",
        framework: "react-native",
        skills: ["ui-ux-mastery", "motion-interaction"],
        verifierPassRate: 0.95,
        fixerRetryCount: 1,
        tasteScore: 0.92,
        benchmarkScore: 0.88,
        edgeCasesFound: ["long_text_truncation", "missing_data"],
        timestamp: 1000,
      },
      {
        projectId: "proj-2",
        framework: "flutter",
        skills: ["ui-ux-mastery", "platform-patterns"],
        verifierPassRate: 0.85,
        fixerRetryCount: 2,
        tasteScore: 0.8,
        benchmarkScore: 0.78,
        edgeCasesFound: ["long_text_truncation"],
        timestamp: 2000,
      },
      {
        projectId: "proj-3",
        framework: "website",
        skills: ["ui-ux-mastery", "motion-interaction"],
        verifierPassRate: 0.98,
        fixerRetryCount: 0,
        tasteScore: 0.95,
        benchmarkScore: 0.9,
        edgeCasesFound: ["long_text_truncation"],
        timestamp: 3000,
      },
    ];

    const analysis = ProjectLogStore.analyzePatterns(mockLogs);

    // 1. Recurring failure detection (long_text_truncation found in all 3 projects)
    expect(analysis.recurringFailures.length).toBe(1);
    expect(analysis.recurringFailures[0].failure).toBe("long_text_truncation");
    expect(analysis.recurringFailures[0].occurrences).toBe(3);
    expect(analysis.recurringFailures[0].recommendation).toContain("Promote strict");

    // 2. Best skill combo ranking
    expect(analysis.bestSkillCombos.length).toBeGreaterThanOrEqual(1);
    const topCombo = analysis.bestSkillCombos[0];
    expect(topCombo.skills).toContain("ui-ux-mastery");
    expect(topCombo.averagePassRate).toBeGreaterThan(0.9);
  });
});
