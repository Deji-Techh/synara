/**
 * Router — cheap/fast classification, picks provider/model + skills.
 * Steal kimi-code policy chain + deepseek dispatch.
 */
export type RouterIntent = "plan" | "build" | "ask" | "verify" | "fix";
export type RouterDecision = {
  intent: RouterIntent;
  model: string;
  skills: string[];
};

export function routePrompt(prompt: string): RouterDecision {
  const lower = prompt.toLowerCase();
  if (lower.includes("plan") || lower.startsWith("/plan")) {
    return { intent: "plan", model: "cheap", skills: ["product-flow"] };
  }
  if (lower.includes("verify") || lower.includes("review")) {
    return { intent: "verify", model: "taste", skills: ["ui-ux-mastery"] };
  }
  return { intent: "build", model: "strong", skills: ["ui-ux-mastery", "motion-interaction"] };
}
