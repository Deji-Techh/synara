// FILE: checkpointChain.ts
// Purpose: Harness-driven iteration ("checkpoint chain", 008-m9b3): after a
// substantive build, the turn runs a deterministic chain of focused design
// passes instead of one giant mono-prompt. Retry-once on zero-change
// passes, hard pass caps, core suite never trimmed.
// Donor: dyad x caide src/prompts/checkpoint_chain.ts (state machine
// verbatim). Skill bodies load via the established readSkill loader instead
// of raw-md imports (same files, same frontmatter strip).

import { stripFrontmatter } from "./skillFrontmatter.ts";
import { readSkill } from "./skillLoader.ts";

export type CheckpointPassId =
  | "product-flow"
  | "onboarding-welcome"
  | "welcome-screens"
  | "ui-ux-core"
  | "motion-interaction"
  | "accessibility"
  | "platform-patterns"
  | "backend-production"
  | "anti-ai-slop";

export type CheckpointPass = { id: CheckpointPassId; body: string };

const PASS_BODIES: Record<CheckpointPassId, string> = {
  "product-flow": stripFrontmatter(readSkill("product-flow/SKILL.md")),
  "onboarding-welcome": stripFrontmatter(readSkill("onboarding-welcome/SKILL.md")),
  // The top-welcome-screens study distilled into craft contracts: measured
  // motion timings, canvas, reduced-motion, interaction gating, semantic
  // actions, branding rules.
  "welcome-screens": readSkill("onboarding-welcome/references/top-welcome-screens.md"),
  "ui-ux-core": stripFrontmatter(readSkill("ui-ux-mastery/references/quality-rubric.md")),
  "motion-interaction": stripFrontmatter(readSkill("motion-interaction/SKILL.md")),
  // The ui-ux-mastery accessibility reference is the focused audit contract
  // for this pass; the full skill stays in main-prompt context.
  accessibility: stripFrontmatter(readSkill("ui-ux-mastery/references/accessibility.md")),
  "platform-patterns": stripFrontmatter(readSkill("ui-ux-mastery/references/platform-patterns.md")),
  "backend-production": stripFrontmatter(readSkill("backend-production/SKILL.md")),
  "anti-ai-slop": stripFrontmatter(readSkill("ui-ux-mastery/references/anti-slop.md")),
};

export interface CheckpointChainConfig {
  /** Brand-new app — includes the product-flow pass. */
  isNewApp: boolean;
  /** This turn touched onboarding/welcome screen files. */
  hasOnboardingScreens: boolean;
  /** This turn touched backend/server/supabase-function code. */
  hasBackendCode: boolean;
  /**
   * Free-tier budget: fewer total passes (core suite stays intact). De-Pro:
   * no quota system exists, so turns always pass false (full chain).
   */
  freeModelMode: boolean;
  /** Web apps get a shorter chain (no onboarding pass). */
  isWebApp: boolean;
}

/** Full chain: conditional skills lead, always-on core follows. */
export const DEFAULT_CHAIN_PASSES = 9;
/** Free-model chain: the always-on core, no conditional skills. */
export const FREE_MODEL_CHAIN_PASSES = 5;

/** Deterministic ordered chain — never keyword-gated by the user's request. */
export function buildCheckpointChain(config: CheckpointChainConfig): CheckpointPass[] {
  const maxPasses = config.freeModelMode ? FREE_MODEL_CHAIN_PASSES : DEFAULT_CHAIN_PASSES;

  // Free tier runs only the always-on core (5 passes) — conditional skills
  // are extra coverage, not core. This guarantees the core suite
  // (ui-ux-core, motion, accessibility, platform-patterns, anti-ai-slop) is
  // never trimmed by the pass cap.
  const conditionalPassIds: CheckpointPassId[] = [];
  if (config.isNewApp) {
    conditionalPassIds.push("product-flow");
  }
  // New apps get a welcome/splash screen by default; existing apps get the
  // pass when onboarding/welcome paths are touched. Web apps have no native
  // splash-welcome layer, so the pass is mobile-only.
  if (!config.isWebApp && (config.isNewApp || config.hasOnboardingScreens)) {
    conditionalPassIds.push("welcome-screens");
  }
  if (!config.isWebApp && config.hasOnboardingScreens) {
    conditionalPassIds.push("onboarding-welcome");
  }
  if (config.hasBackendCode) {
    conditionalPassIds.push("backend-production");
  }

  const corePassIds: CheckpointPassId[] = [
    "ui-ux-core",
    "motion-interaction",
    "accessibility",
    "platform-patterns",
    "anti-ai-slop",
  ];

  // Conditional skills lead, then the always-on core. Cap from the FRONT so
  // the core tail (anti-ai-slop last) is never trimmed.
  const passIds = config.freeModelMode ? corePassIds : [...conditionalPassIds, ...corePassIds];
  const trimmed = passIds.slice(Math.max(0, passIds.length - maxPasses));
  return trimmed.map((id) => ({ id, body: PASS_BODIES[id] }));
}

export interface CheckpointChain {
  /** Passes not yet scheduled or waiting on a retry. */
  pending: CheckpointPass[];
  /** The pass currently scheduled (null when starting a fresh pass). */
  inFlight: CheckpointPass | null;
  /** Retries already used for the in-flight pass. */
  retriesUsed: number;
}

export function createChain(config: CheckpointChainConfig): CheckpointChain {
  return {
    pending: buildCheckpointChain(config),
    inFlight: null,
    retriesUsed: 0,
  };
}

/** Action the harness should take for the next loop iteration. */
export type ChainStep = "done" | "retry" | "next";

/**
 * Advance the state machine with the outcome of the iteration that just ran.
 * `madeEdits` is whether the previous scheduled pass changed any files. A
 * zero-change pass is retried exactly once, then we move on.
 */
export function advanceChain(
  chain: CheckpointChain,
  madeEdits: boolean,
): { step: ChainStep; pass: CheckpointPass | null } {
  if (chain.inFlight && !madeEdits && chain.retriesUsed < 1) {
    chain.retriesUsed += 1;
    return { step: "retry", pass: chain.inFlight };
  }
  chain.inFlight = null;
  chain.retriesUsed = 0;
  const next = chain.pending.shift() ?? null;
  chain.inFlight = next;
  return { step: next ? "next" : "done", pass: next };
}

export function buildPassPrompt(
  pass: CheckpointPass,
  opts?: { retry?: boolean; target?: "app" | "plan" },
): string {
  const { retry, target = "app" } = opts ?? {};
  const retryNote = retry
    ? `\n\n[System] The previous attempt at this pass made no changes. ` +
      `Re-inspect; if the contract is already satisfied, reply concisely ` +
      `that this pass is complete.`
    : "";
  const targetNote =
    target === "plan"
      ? `Inspect the implementation plan (not built code). If the plan ` +
        `violates the contract below, revise the plan in writing and note ` +
        `the change in your reply. Do not invent file edits.`
      : `Inspect the current app state and apply the skill contract below. ` +
        `Change only what actually violates the contract for this pass; do ` +
        `not redesign unrelated screens. If the contract is already ` +
        `satisfied, reply concisely that no changes were needed.`;
  return (
    `[System] Checkpoint pass: ${pass.id}.\n\n` +
    targetNote +
    `\n\n<checkpoint-skill name="${pass.id}">\n${pass.body}\n</checkpoint-skill>` +
    retryNote
  );
}

const ONBOARDING_SCREEN_PATTERN =
  /welcome|onboard|get-?started|getting-?started|intro|landing|first-?time|first-?run/i;

/** Whether a file path strongly suggests an onboarding/welcome screen. */
export function isOnboardingScreenPath(filePath: string): boolean {
  return ONBOARDING_SCREEN_PATTERN.test(filePath);
}

const BACKEND_CODE_PATTERN =
  /(^|\/)(supabase\/functions|backend|server|api|functions|routes|middleware|handlers|controllers|services)(\/|\.|$)/i;

/** Whether a file path strongly suggests backend/server/supabase code. */
export function isBackendCodePath(filePath: string): boolean {
  return BACKEND_CODE_PATTERN.test(filePath);
}

export function hasStartedChain(chain: CheckpointChain): boolean {
  return chain.inFlight !== null || chain.pending.length > 0;
}
