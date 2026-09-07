// FILE: reviewBarrier.ts
// Purpose: Post-turn review barrier — when a turn mutates the working tree,
// a reviewer subagent audits the diff (correctness, security, scope,
// taste) and the verdict is forwarded as a verifier_result event. Skips
// clean trees, non-repos, ask mode, and timeouts (null = skipped, never a
// turn failure). Donor: subagents/review_* barrier (review_target +
// review_result + runAutoReviewBarrier), adapted to git + runSubagentLoop.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LLMAdapter } from "../../harness/loop/loop.ts";
import type { ToolDef } from "../../harness/tools/defineTool.ts";
import { runSubagentLoop } from "./subagentLoop.ts";
import { REVIEWER_SYSTEM_PROMPT } from "./personas.ts";

const execFileAsync = promisify(execFile);
const REVIEW_TIMEOUT_MS = 120_000;
const MAX_DIFF_CHARS = 20_000;

export interface ReviewIssue {
  severity: "blocker" | "major" | "minor";
  file: string;
  detail: string;
  suggestion: string;
}

export interface ReviewVerdict {
  passed: boolean;
  confidence: number;
  tasteScore: number;
  issues: ReviewIssue[];
}

async function gitStatus(appPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
      cwd: appPath,
      timeout: 15_000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

function clamp(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fallback;
}

/** Parse reviewer output (exported for tests). */
export function parseVerdict(text: string): ReviewVerdict {
  const match = text.match(/\{[\s\S]*"passed"[\s\S]*\}/);
  if (!match) {
    const failed = /failed|blocker|vulnerab/i.test(text);
    return { passed: !failed, confidence: 50, tasteScore: 50, issues: [] };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      passed?: unknown;
      confidence?: unknown;
      tasteScore?: unknown;
      issues?: unknown;
    };
    const issues: ReviewIssue[] = Array.isArray(parsed.issues)
      ? (parsed.issues as Array<Record<string, unknown>>)
          .filter((i) => i && typeof i.detail === "string")
          .slice(0, 20)
          .map((i) => ({
            severity: i.severity === "blocker" || i.severity === "major" ? i.severity : "minor" as const,
            file: typeof i.file === "string" ? i.file.slice(0, 300) : "",
            detail: (i.detail as string).slice(0, 500),
            suggestion: typeof i.suggestion === "string" ? i.suggestion.slice(0, 500) : "",
          }))
      : [];
    return {
      passed: parsed.passed !== false && !issues.some((i) => i.severity === "blocker"),
      confidence: clamp(parsed.confidence, 50),
      tasteScore: clamp(parsed.tasteScore, 50),
      issues,
    };
  } catch {
    return { passed: true, confidence: 50, tasteScore: 50, issues: [] };
  }
}

/** Serialize structured issues for the verifier_result event (string[] contract). */
export function formatIssuesForEvent(issues: ReviewIssue[]): string[] {
  return issues.map(
    (i) => `[${i.severity}]${i.file ? ` ${i.file}` : ""} — ${i.detail}${i.suggestion ? ` → ${i.suggestion}` : ""}`,
  );
}

export interface ReviewBarrierDeps {
  appPath: string;
  sessionId: string;
  /** Task the turn claims to have done (grounds the review). */
  taskSummary: string;
  llm: LLMAdapter;
  tools: ToolDef[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Run the review barrier. Returns null when skipped (clean tree, non-repo,
 * timeout, abort, reviewer error) — skipping never fails the turn.
 */
export async function runReviewBarrier(deps: ReviewBarrierDeps): Promise<ReviewVerdict | null> {
  const status = await gitStatus(deps.appPath);
  if (!status) return null;
  let diff: string;
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--stat", "--", "."], {
      cwd: deps.appPath,
      timeout: 15_000,
    });
    const { stdout: patch } = await execFileAsync("git", ["diff", "--", "."], {
      cwd: deps.appPath,
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    diff = `${stdout}\n\n${patch}`.trim();
  } catch {
    return null;
  }
  if (!diff) return null;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `...[diff truncated — showing last ${MAX_DIFF_CHARS} chars]\n${diff.slice(-MAX_DIFF_CHARS)}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("review-timeout"), deps.timeoutMs ?? REVIEW_TIMEOUT_MS);
  const onAbort = () => controller.abort(deps.signal?.reason ?? "cancelled");
  deps.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await runSubagentLoop({
      appPath: deps.appPath,
      sessionId: `${deps.sessionId}:review`,
      system: REVIEWER_SYSTEM_PROMPT,
      task: `Task under review: ${deps.taskSummary}\n\nDiff under review:\n${diff}`,
      tools: [],
      llm: deps.llm,
      signal: controller.signal,
      persona: "reviewer",
      maxSteps: 3,
    });
    if (controller.signal.aborted) return null;
    return parseVerdict(result.finalText);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener("abort", onAbort);
  }
}
