import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  parseFrontmatter,
  type SkillFrontmatter,
} from "./skill_frontmatter";

export interface SkillEntry {
  id: string;
  frontmatter: SkillFrontmatter;
  body: string;
  raw: string;
  source: "bundled" | "user" | "project";
}

/**
 * Scan a directory for SKILL.md files, returning parsed entries.
 * Expected structure: <dir>/<skill-name>/SKILL.md
 */
export function loadSkillsFromDir(
  dir: string,
  source: SkillEntry["source"],
): SkillEntry[] {
  try {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const skills: SkillEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const raw = readFileSync(skillPath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw);
      skills.push({
        id: entry.name,
        frontmatter,
        body,
        raw,
        source,
      });
    }
    return skills;
  } catch {
    return [];
  }
}

export function getProjectSkillsDir(projectPath: string): string {
  return join(projectPath, ".claude", "skills");
}

export function getUserSkillsDir(): string {
  return join(homedir(), ".claude", "skills");
}

export interface LoadedSkills {
  all: SkillEntry[];
  bySource: {
    bundled: SkillEntry[];
    user: SkillEntry[];
    project: SkillEntry[];
  };
  byId: Map<string, SkillEntry>;
}

/**
 * Load all skills from all sources, merging with bundled defaults.
 * Project skills override user skills, which override bundled skills
 * when IDs conflict.
 */
export function loadAllSkills(
  bundledSkillIds: string[],
  projectPath?: string,
): LoadedSkills {
  const userSkills = projectPath
    ? loadSkillsFromDir(getProjectSkillsDir(projectPath), "project")
    : [];
  const projectSkills = loadSkillsFromDir(getUserSkillsDir(), "user");

  const bySource = {
    bundled: [] as SkillEntry[],
    user: userSkills,
    project: projectSkills,
  };

  const byId = new Map<string, SkillEntry>();

  // Apply in reverse override order: project > user > bundled
  // We don't load bundled skills from disk; they're imported statically.
  // We just register placeholder entries for them.
  for (const id of bundledSkillIds) {
    byId.set(id, { id, frontmatter: {}, body: "", raw: "", source: "bundled" });
  }

  for (const skill of userSkills) {
    byId.set(skill.id, skill);
  }
  for (const skill of projectSkills) {
    byId.set(skill.id, skill);
  }

  return { all: [...byId.values()], bySource, byId };
}

/**
 * Check if a file path matches any skill's path glob patterns.
 * Returns matching skill IDs.
 */
export function matchSkillsByPath(
  filePath: string,
  skills: SkillEntry[],
): string[] {
  const matched: string[] = [];
  for (const skill of skills) {
    const paths = skill.frontmatter.paths;
    if (!paths || paths.length === 0) continue;
    for (const pattern of paths) {
      if (simpleGlobMatch(filePath, pattern)) {
        matched.push(skill.id);
        break;
      }
    }
  }
  return matched;
}

function simpleGlobMatch(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const normalizedPath = filePath.replace(/\\/g, "/");

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath.startsWith(prefix);
  }

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    return (
      normalizedPath.startsWith(prefix) &&
      !normalizedPath.slice(prefix.length).includes("/")
    );
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(
      "^" + normalizedPattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
    );
    return regex.test(normalizedPath);
  }

  return normalizedPath === normalizedPattern;
}

/**
 * Get skills whose context === "fork", indicating they should run
 * as sub-agents rather than inline.
 */
export function getForkSkills(skills: SkillEntry[]): SkillEntry[] {
  return skills.filter((s) => s.frontmatter.context === "fork");
}
