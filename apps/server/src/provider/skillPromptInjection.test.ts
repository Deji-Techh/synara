// FILE: skillPromptInjection.test.ts
// Purpose: Verifies which providers receive inlined portable skill instructions
//          and that the inline text respects the turn character budget.
// Layer: Server provider tests

import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildInlineSkillInstructions,
  shouldInlineSkillForProvider,
} from "./skillPromptInjection.ts";

const caideSkillPath = "/Users/me/.caide/skills/reviewer/SKILL.md";
const codexSkillPath = "/Users/me/.codex/skills/reviewer/SKILL.md";
const claudeSkillPath = "/Users/me/.claude/skills/reviewer/SKILL.md";
const cursorSkillPath = "/Users/me/.cursor/skills/reviewer/SKILL.md";
const piSkillPath = "/Users/me/.pi/agent/skills/reviewer/SKILL.md";

describe("shouldInlineSkillForProvider", () => {
  const engineSkillPath = "/Users/me/.engine/skills/reviewer/SKILL.md";
  const opencodeSkillPath = "/Users/me/.opencode/skills/reviewer/SKILL.md";

  it("skips engine-native skills for engine provider", () => {
    expect(shouldInlineSkillForProvider("engine", engineSkillPath)).toBe(false);
    expect(shouldInlineSkillForProvider("engine", caideSkillPath)).toBe(true);
  });

  it("skips opencode-native skills for opencode providers", () => {
    expect(shouldInlineSkillForProvider("opencodeZen", opencodeSkillPath)).toBe(false);
    expect(shouldInlineSkillForProvider("opencodeZen", caideSkillPath)).toBe(true);
    expect(shouldInlineSkillForProvider("opencodeGo", opencodeSkillPath)).toBe(false);
  });

  it("always inlines for providers without native skill support", () => {
    for (const provider of ["groq"] as const) {
      expect(shouldInlineSkillForProvider(provider, caideSkillPath)).toBe(true);
      expect(shouldInlineSkillForProvider(provider, claudeSkillPath)).toBe(true);
    }
  });
});

describe("buildInlineSkillInstructions", () => {
  it("inlines skill content for non-native providers and skips unreadable paths", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "skill-inline-"));
    const skillDir = path.join(root, ".caide", "skills", "reviewer");
    try {
      await mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, "SKILL.md");
      await writeFile(skillPath, "# Reviewer\n\nAlways review carefully.");

      const text = await buildInlineSkillInstructions({
        provider: "groq",
        skills: [
          { name: "reviewer", path: skillPath },
          { name: "missing", path: path.join(root, ".caide", "skills", "missing", "SKILL.md") },
        ],
        maxChars: 10_000,
      });

      expect(text).toContain('<skill name="reviewer"');
      expect(text).toContain("Always review carefully.");
      expect(text).not.toContain("missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns empty text when nothing fits in the budget", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "skill-inline-budget-"));
    const skillDir = path.join(root, ".caide", "skills", "reviewer");
    try {
      await mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, "SKILL.md");
      await writeFile(skillPath, "content".repeat(100));

      const text = await buildInlineSkillInstructions({
        provider: "groq",
        skills: [{ name: "reviewer", path: skillPath }],
        maxChars: 50,
      });

      expect(text).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not inline engine-native skills for engine", async () => {
    const text = await buildInlineSkillInstructions({
      provider: "engine",
      skills: [{ name: "reviewer", path: "/Users/me/.engine/skills/reviewer/SKILL.md" }],
      maxChars: 10_000,
    });
    expect(text).toBe("");
  });
});
