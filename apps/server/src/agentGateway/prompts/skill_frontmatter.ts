import { z } from "zod";

export const SkillFrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  when_to_use: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  context: z.enum(["inline", "fork"]).optional(),
  /**
   * The chain phase this skill is injected at, e.g. "welcome" for the
   * first-run onboarding checkpoint pass. Skills with a checkpoint are not
   * always-injected; the harness loads them as a focused pass of the build.
   */
  checkpoint: z.string().optional(),
  paths: z.array(z.string()).optional(),
  version: z.string().optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  raw: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n*/;

export function parseFrontmatter(raw: string): ParsedSkill {
  const match = raw.match(FRONTMATTER_RE);
  if (!match || !match[1]) {
    return { frontmatter: {}, body: raw.trim(), raw };
  }
  const yamlBlock = match[1];
  const body = raw.slice(match[0].length).trim();
  let frontmatter: SkillFrontmatter = {};
  try {
    const parsed = parseYamlSimple(yamlBlock);
    frontmatter = SkillFrontmatterSchema.parse(parsed);
  } catch {
    // If YAML or schema parsing fails, return empty frontmatter
  }
  return { frontmatter, body, raw };
}

export function stripFrontmatter(raw: string): string {
  return raw.replace(FRONTMATTER_RE, "").trim();
}

function parseYamlSimple(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  const lines = yaml.split("\n");
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && listMatch[1]) {
      currentArray.push(listMatch[1].trim());
      if (currentKey) {
        result[currentKey] = [...currentArray];
      }
      continue;
    }
    if (currentArray.length > 0 && line.trim() === "") {
      currentArray = [];
      currentKey = null;
      continue;
    }
    if (currentArray.length > 0 && !line.match(/^\s*-/)) {
      currentArray = [];
      currentKey = null;
    }
    const kvMatch = line.match(/^(\w[\w_-]*?):\s*(.*)$/);
    if (kvMatch && kvMatch[1]) {
      currentKey = kvMatch[1];
      currentArray = [];
      const value = (kvMatch[2] ?? "").trim();
      if (value.startsWith("[") && value.endsWith("]")) {
        result[currentKey] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
      } else if (value === "" || value === "null" || value === "~") {
        result[currentKey] = undefined;
      } else {
        result[currentKey] = value.replace(/^['"]|['"]$/g, "");
      }
    }
  }
  return result;
}
