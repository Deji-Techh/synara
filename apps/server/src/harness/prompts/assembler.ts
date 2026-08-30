import * as fs from "node:fs";
import * as path from "node:path";
import { L0_IDENTITY_CORE, L1_ROLE_PROMPTS, buildL2StageContext, type StageContextInput } from "./layers.ts";
import type { HarnessRole } from "../session/buildChain.ts";

export class MissingPromptVariableError extends Error {
  constructor(public readonly missingVar: string) {
    super(`Missing required prompt template variable: '{{${missingVar}}}'`);
    this.name = "MissingPromptVariableError";
  }
}

export interface AssemblePromptOptions {
  role: HarnessRole;
  stage: StageContextInput | string;
  framework: string;
  skills?: string[];
  vars?: Record<string, string>;
  modelContextLimit?: number;
  onBudgetWarning?: (estimatedTokens: number, limit: number) => void;
}

/**
 * Strict template interpolation: replaces all {{varName}} placeholders.
 * Throws MissingPromptVariableError if any placeholder is undefined or missing from vars.
 */
export function renderTemplateStrict(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, varName) => {
    if (!(varName in vars) || vars[varName] === undefined || vars[varName] === null) {
      throw new MissingPromptVariableError(varName);
    }
    return vars[varName];
  });
}

/**
 * Loads skill files from harness/skills/ directory.
 */
export function loadSkillContent(skillName: string, skillsDir?: string): string {
  const dir = skillsDir ?? path.join(__dirname, "..", "skills");
  const fileName = skillName.endsWith(".md") ? skillName : `${skillName}.md`;
  const filePath = path.join(dir, fileName);

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    // Strip YAML frontmatter
    return raw.replace(/^---[\s\S]*?---\n*/, "").trim();
  }

  return "";
}

/**
 * Resolves the relevant skills for a given role, stage, and framework.
 */
export function resolveSkills(
  role: HarnessRole,
  stage: string,
  framework: string,
  userSkills: string[] = [],
  skillsDir?: string,
): string[] {
  const skillNames = new Set<string>(userSkills);

  // Automatic skill assignment based on role and stage
  if (role === "builder" || role === "planner") {
    skillNames.add("ui-ux-mastery");
    skillNames.add("product-flow");
    skillNames.add("motion-interaction");
    skillNames.add("anti-ai-slop");
    if (framework === "react-native" || framework === "flutter") {
      skillNames.add("platform-patterns");
    }
  } else if (role === "verifier" || role === "taste") {
    skillNames.add("ui-ux-mastery");
    skillNames.add("anti-ai-slop");
    skillNames.add("motion-interaction");
  } else if (role === "fixer") {
    skillNames.add("ui-ux-mastery");
    skillNames.add("backend-production");
  }

  const skillContents: string[] = [];
  for (const name of skillNames) {
    const content = loadSkillContent(name, skillsDir);
    if (content) {
      skillContents.push(content);
    }
  }

  return skillContents;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.8);
}

/**
 * Assembles the full L0-L3 layered prompt with strict variable interpolation
 * and token budget verification.
 */
export function assemblePrompt(options: AssemblePromptOptions): string {
  const {
    role,
    stage,
    framework,
    skills = [],
    vars = {},
    modelContextLimit = 128_000,
    onBudgetWarning,
  } = options;

  // L0: Identity Core (Cached)
  const l0 = L0_IDENTITY_CORE;

  // L1: Role Prompt (Cached per role)
  const l1 = L1_ROLE_PROMPTS[role] ?? L1_ROLE_PROMPTS.builder;

  // L2: Dynamic Stage Context
  const l2 =
    typeof stage === "string"
      ? buildL2StageContext({ stageName: stage, framework })
      : buildL2StageContext({ ...stage, framework });

  // L3: Resolved Skills
  const l3Resolved = skills.length > 0 ? skills : resolveSkills(role, typeof stage === "string" ? stage : stage.stageName, framework);
  const l3 = l3Resolved.length > 0 ? `## Relevant Skill Packs\n\n${l3Resolved.join("\n\n---\n\n")}` : "";

  const assembledRaw = [
    l0,
    "---",
    l1,
    "---",
    l2,
    ...(l3 ? ["---", l3] : []),
  ].join("\n\n");

  // Perform strict {{var}} rendering on the assembled prompt
  const finalPrompt = renderTemplateStrict(assembledRaw, vars);

  // Check token budget (90% limit alert)
  const estimatedTokens = estimateTokenCount(finalPrompt);
  const warningThreshold = modelContextLimit * 0.9;

  if (estimatedTokens > warningThreshold) {
    if (onBudgetWarning) {
      onBudgetWarning(estimatedTokens, modelContextLimit);
    } else {
      console.warn(
        `[PromptAssembler:Warning] Prompt token budget exceeded 90% threshold: estimated ${estimatedTokens} tokens / ${modelContextLimit} limit.`,
      );
    }
  }

  return finalPrompt;
}
