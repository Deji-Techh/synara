// harness/selfImprove.ts — M23 self-improving loop with real SKILL.md refinement
import { shouldRefineSkill, type SkillComboStats } from "./evaluation";
import { executeTool } from "./tools";
import { sendToProvider, composePrompt } from "./layers";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");
const stats = new Map<string, SkillComboStats>();

export function recordSliceResult(input: { combo: readonly string[]; confidence: number; retries: number }): void {
  const key = input.combo.join("|");
  const prev = stats.get(key);
  const count = (prev?.count ?? 0) + 1;
  const avg = prev ? (prev.verifierConfidenceAvg * prev.count + input.confidence) / count : input.confidence;
  const retryRate = prev ? (prev.fixerRetryRate * prev.count + (input.retries > 0 ? 1 : 0)) / count : input.retries > 0 ? 1 : 0;
  const next: SkillComboStats = { combo: input.combo, verifierConfidenceAvg: avg, fixerRetryRate: retryRate, count };
  stats.set(key, next);
  if (shouldRefineSkill(next)) {
    refineSkill(next);
  }
}

// M23: Actually refine SKILL.md when combo underperforms
async function refineSkill(stats: SkillComboStats): Promise<void> {
  const skillDir = join(CAIDE_HOME, "skills");
  const skillFile = join(skillDir, `${stats.combo[0] ?? "default"}.md`);

  // Read existing skill if it exists
  const existing = await executeTool("read", { path: `${stats.combo[0] ?? "default"}.md` }, skillDir);
  const existingContent = existing.ok && existing.result ? existing.result : "# Skill\n\nNo content yet.";

  // Use provider to generate improved skill
  const prompt = composePrompt(
    "harness",
    `The skill "${stats.combo[0]}" is underperforming:
- Average confidence: ${stats.verifierConfidenceAvg.toFixed(2)} (threshold: 0.82)
- Fixer retry rate: ${stats.fixerRetryRate.toFixed(2)} (threshold: 0.4)
- Total uses: ${stats.count}

Current skill content:
${existingContent}

Generate an improved version of this skill that addresses the low confidence and high retry rate. Focus on:
1. Common failure patterns for this skill combination
2. Better guidelines for the Builder role when using this skill
3. Specific anti-patterns to avoid

Return ONLY the improved skill content, no explanations.`,
    [],
  );

  try {
    const result = await sendToProvider(prompt, { model: "deepseek-v4-flash", baseUrl: "https://opencode.ai/zen/v1", apiKey: "" });
    if (result.text.length > 50) {
      // Write refined skill
      await executeTool("write", { path: `${stats.combo[0] ?? "default"}.md`, content: result.text }, skillDir);

      // Log the refinement
      const logEntry = `[${new Date().toISOString()}] Refined skill "${stats.combo[0]}" — confidence: ${stats.verifierConfidenceAvg.toFixed(2)}, retries: ${stats.fixerRetryRate.toFixed(2)}, uses: ${stats.count}\n`;
      await executeTool("write", { path: "self-improve.log", content: logEntry }, join(CAIDE_HOME, "self-improve")).catch(() => {});
    }
  } catch {}
}

export function getStats(): readonly SkillComboStats[] {
  return [...stats.values()];
}
