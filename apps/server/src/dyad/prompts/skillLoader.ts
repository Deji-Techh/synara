// FILE: skillLoader.ts
// Purpose: fs-based skill/guide markdown loader for the Dyad transplant.
// Donor pattern: dyad x caide used Vite `?raw` imports; this server runs on
// Bun/tsdown where `?raw` is unavailable, so skills ship as .md files under
// apps/server/src/dyad/{skills,skills-web3,guides}/ and load at runtime.
// Mirrors the candidate-dir strategy of harness/prompts/assembler.ts.

import * as fs from "node:fs";
import * as path from "node:path";

function dyadRootCandidates(): string[] {
  const here = import.meta.dirname ?? "";
  return [
    path.join(here, ".."),
    path.join(here, "..", "..", "dyad"),
    path.join(process.cwd(), "apps/server/src/dyad"),
  ];
}

function readFirst(relativePaths: string[]): string {
  for (const root of dyadRootCandidates()) {
    for (const rel of relativePaths) {
      const filePath = path.join(root, rel);
      try {
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
      } catch {
        // try next candidate
      }
    }
  }
  return "";
}

/** Read a general skill file, e.g. "ui-ux-mastery/SKILL.md". */
export function readSkill(relativePath: string): string {
  return readFirst([path.join("skills", relativePath)]);
}

/** Read a web3 skill file, e.g. "web3-solana/SKILL.md". */
export function readWeb3Skill(relativePath: string): string {
  return readFirst([path.join("skills-web3", relativePath)]);
}

/** Read a guide file, e.g. "provision-backend.md". */
export function readGuide(relativePath: string): string {
  const fileName = relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`;
  return readFirst([path.join("guides", fileName)]);
}

/**
 * Lazily fetchable UI-skill documents (references/templates/companions that
 * used to be inlined into every mobile prompt — ~130k chars per turn).
 * Strict allowlist under skills/: no traversal, no absolute paths.
 */
const UI_SKILL_DOCS: Record<string, string> = {
  // ui-ux-mastery references
  "ui-ux/product-archetypes": "ui-ux-mastery/references/product-archetypes.md",
  "ui-ux/design-system": "ui-ux-mastery/references/design-system.md",
  "ui-ux/component-contracts": "ui-ux-mastery/references/component-contracts.md",
  "ui-ux/accessibility": "ui-ux-mastery/references/accessibility.md",
  "ui-ux/anti-slop": "ui-ux-mastery/references/anti-slop.md",
  "ui-ux/design-to-code": "ui-ux-mastery/references/design-to-code.md",
  "ui-ux/platform-patterns": "ui-ux-mastery/references/platform-patterns.md",
  "ui-ux/quality-rubric": "ui-ux-mastery/references/quality-rubric.md",
  "ui-ux/motion-direction": "ui-ux-mastery/references/motion-direction.md",
  // ui-ux-mastery templates
  "ui-ux/screen-spec": "ui-ux-mastery/templates/screen-spec.md",
  "ui-ux/component-contract": "ui-ux-mastery/templates/component-contract.md",
  "ui-ux/design-audit": "ui-ux-mastery/templates/design-audit.md",
  "ui-ux/persistent-design-spec": "ui-ux-mastery/templates/design-spec.md",
  "ui-ux/persistent-motion-storyboard": "ui-ux-mastery/templates/motion-storyboard.md",
  // companion skills
  "ui-ux/motion-interaction": "motion-interaction/SKILL.md",
  "ui-ux/product-flow": "product-flow/SKILL.md",
  "ui-ux/backend-production": "backend-production/SKILL.md",
  "ui-ux/anti-ai-slop": "anti-ai-slop/SKILL.md",
};

export function listUiSkillDocIds(): string[] {
  return Object.keys(UI_SKILL_DOCS).sort();
}

/** Read one allowlisted UI-skill document. Empty string when unknown. */
export function readUiSkillDoc(id: string): string {
  const rel = UI_SKILL_DOCS[id];
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) return "";
  return readFirst([path.join("skills", rel)]);
}
