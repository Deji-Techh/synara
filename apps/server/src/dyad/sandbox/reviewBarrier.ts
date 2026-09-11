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
import { lintProjectTool } from "../../harness/tools/coreTools.ts";
import { runSubagentLoop } from "./subagentLoop.ts";
import { REVIEWER_SYSTEM_PROMPT } from "./personas.ts";

/** Taste bar: scores below this flag the card distinctly (advisory, never blocks). */
export const TASTE_BAR = 60;

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
  /** True when UI files changed but no visual evidence was supplied. */
  missingEvidence?: boolean;
}

/** Consecutive evidence-miss streak per session (graduated block gate). */
const evidenceMissStreak = new Map<string, number>();

export function getEvidenceMissStreak(sessionId: string): number {
  return evidenceMissStreak.get(sessionId) ?? 0;
}

export function recordEvidenceOutcome(sessionId: string, missing: boolean): number {
  const next = missing ? getEvidenceMissStreak(sessionId) + 1 : 0;
  if (next === 0) evidenceMissStreak.delete(sessionId);
  else evidenceMissStreak.set(sessionId, next);
  return next;
}

/** Test seam: reset streak state. */
export function clearEvidenceMissStreak(sessionId?: string): void {
  if (sessionId) evidenceMissStreak.delete(sessionId);
  else evidenceMissStreak.clear();
}

/** Diff paths that count as UI touches for the evidence gate. */
const UI_TOUCH_PATTERN = /\.(tsx|jsx|dart|css|scss|less|vue|svelte)$|[\/](screens|pages|components|widgets|views|app|lib)[\/]/i;

export function diffTouchesUi(diff: string): boolean {
  const paths = new Set<string>();
  for (const match of diff.matchAll(/^diff --git a\/(\S+) b\/\S+/gm)) {
    if (match[1]) paths.add(match[1]);
  }
  for (const match of diff.matchAll(/^\+\+\+ b\/(\S+)/gm)) {
    if (match[1]) paths.add(match[1]);
  }
  for (const p of paths) {
    if (UI_TOUCH_PATTERN.test(p)) return true;
  }
  return false;
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
  /** Visual evidence refs (e.g. .caide/evidence/shot-*.png) for UI turns. */
  evidence?: string[];
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
  // Evidence gate inputs: UI-touch detection + supplied refs. The blocker
  // itself is injected deterministically below (never reviewer-dependent).
  const touchedUi = diffTouchesUi(diff);
  const evidenceRefs = (deps.evidence ?? []).map((e) => e.trim()).filter(Boolean);
  const missingEvidence = touchedUi && evidenceRefs.length === 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("review-timeout"), deps.timeoutMs ?? REVIEW_TIMEOUT_MS);
  const onAbort = () => controller.abort(deps.signal?.reason ?? "cancelled");
  deps.signal?.addEventListener("abort", onAbort, { once: true });
  // Headless lint evidence for the reviewer (best-effort; skipped on abort).
  // lint_project throws on dirty output, so distinguish exec failures WITH
  // output (dirty) from failures without (aborted / could not run).
  let lintEvidence = "Lint: not run.";
  try {
    const lint = (await lintProjectTool.execute({}, {
      signal: controller.signal,
      appPath: deps.appPath,
      sessionId: deps.sessionId,
      toolId: "review-lint",
    })) as { clean?: boolean; stdout?: string; stderr?: string };
    const output = `${lint.stdout ?? ""}\n${lint.stderr ?? ""}`.trim().slice(-3000);
    lintEvidence = lint.clean ? "Lint: clean." : `Lint: DIRTY.\n${output}`;
  } catch (err) {
    const out = `${(err as { stdout?: unknown })?.stdout ?? ""}\n${(err as { stderr?: unknown })?.stderr ?? ""}`.trim().slice(-3000);
    lintEvidence = out
      ? `Lint: DIRTY.\n${out}`
      : "Lint: unavailable (aborted or failed to run).";
  }
  try {
    const result = await runSubagentLoop({
      appPath: deps.appPath,
      sessionId: `${deps.sessionId}:review`,
      system: REVIEWER_SYSTEM_PROMPT,
      task: `Task under review: ${deps.taskSummary}\n\n${lintEvidence}\n\nVisual evidence: ${evidenceRefs.length > 0 ? evidenceRefs.join(", ") : "NONE — UI changes without screenshots cannot pass; record a blocker-severity issue demanding screenshots before approval."}\n\nDiff under review:\n${diff}`,
      tools: [],
      llm: deps.llm,
      signal: controller.signal,
      persona: "reviewer",
      maxSteps: 3,
    });
    if (controller.signal.aborted) return null;
    const verdict = parseVerdict(result.finalText);
    if (missingEvidence) {
      // Deterministic gate — never depends on reviewer obedience.
      verdict.missingEvidence = true;
      verdict.passed = false;
      verdict.issues.unshift({
        severity: "blocker",
        file: "",
        detail: "missing visual evidence: UI files changed but no screenshots were captured (call screenshot, then re-verify)",
        suggestion: "Run the app preview, capture screenshots of every touched screen, then request review again.",
      });
    }
    return verdict;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener("abort", onAbort);
  }
}
