import { BUILDER_ROLE_PROMPT } from "./roles/builder.ts";
import { VERIFIER_ROLE_PROMPT } from "./roles/verifier.ts";
import { ROUTER_ROLE_PROMPT } from "./roles/router.ts";
import { PLANNER_ROLE_PROMPT } from "./roles/planner.ts";
import { FIXER_ROLE_PROMPT } from "./roles/fixer.ts";
import { TASTE_ROLE_PROMPT } from "./roles/taste.ts";
import type { HarnessRole } from "../session/buildChain.ts";

export const L0_IDENTITY_CORE = `You are Caide — the world's best autonomous AI app builder engine.
You design, build, test, verify, and polish production-grade applications for Blank, React Native, Flutter, and Website frameworks.

Core Operational Directives:
1. Pure Harness Discipline: Operate strictly within your assigned role (Router, Planner, Builder, Verifier, Fixer, or Taste).
2. Quality Over Speed: Every screen must be feature-complete, gorgeous, accessible, and robust.
3. Strict Design Tokens: Always adhere to .caide/design-spec.json and .caide/motion-spec.json. No ad-hoc styling.
4. Complete States: Never output unfinished UI — always provide empty, loading, error, and content states.
5. Sandbox Integrity: Never attempt to escape the workspace root.
6. Zero Slop: No placeholder text, no generic gradients, no unstyled controls.`;

export const L1_ROLE_PROMPTS: Record<HarnessRole, string> = {
  builder: BUILDER_ROLE_PROMPT,
  verifier: VERIFIER_ROLE_PROMPT,
  router: ROUTER_ROLE_PROMPT,
  planner: PLANNER_ROLE_PROMPT,
  fixer: FIXER_ROLE_PROMPT,
  taste: TASTE_ROLE_PROMPT,
};

export interface StageContextInput {
  stageName: string;
  framework: string;
  sliceIndex?: number;
  totalSlices?: number;
  availableArtifacts?: string[];
  exitGate?: string;
  lastOutcome?: string;
}

export function buildL2StageContext(input: StageContextInput): string {
  const parts = [
    `## Stage Context (Stage: ${input.stageName})`,
    `- Framework: ${input.framework}`,
  ];

  if (input.sliceIndex !== undefined && input.totalSlices !== undefined) {
    parts.push(`- Slice: ${input.sliceIndex + 1} of ${input.totalSlices}`);
  }

  if (input.availableArtifacts && input.availableArtifacts.length > 0) {
    parts.push(`- Available Artifacts: ${input.availableArtifacts.join(", ")}`);
  }

  if (input.exitGate) {
    parts.push(`- Exit Gate Requirements: ${input.exitGate}`);
  }

  if (input.lastOutcome) {
    parts.push(`- Previous Stage Outcome: ${input.lastOutcome}`);
  }

  return parts.join("\n");
}
