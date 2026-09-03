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
  const fileName = relativePath.endsWith(".md")
    ? relativePath
    : `${relativePath}.md`;
  return readFirst([path.join("guides", fileName)]);
}
