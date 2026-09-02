/**
 * Router — fast, lightweight intent classification.
 * Picks the optimal role, model tier, skills, and permission tier.
 */
import type { ProjectFramework } from "@caide/contracts";

export type RouterIntent = "ask" | "plan" | "build" | "verify" | "fix";
export type ModelTier = "cheap" | "medium" | "strong" | "taste";
export type PermissionTier = "yolo" | "tier1" | "manual";

export interface RouterDecision {
  intent: RouterIntent;
  model: ModelTier;
  skills: string[];
  tier: PermissionTier;
  framework: ProjectFramework;
  confidence: number;
  reasoning?: string;
}

export interface RouterContext {
  framework?: ProjectFramework;
  hasSpec?: boolean;
  isNewProject?: boolean;
  lastStage?: string;
}

export interface FastLLMClassifier {
  classify: (prompt: string, context?: RouterContext) => Promise<Partial<RouterDecision>>;
}

const INTENT_MODEL_MAP: Record<RouterIntent, ModelTier> = {
  ask: "cheap",
  plan: "medium",
  build: "strong",
  verify: "taste",
  fix: "medium",
};

const INTENT_SKILLS_MAP: Record<RouterIntent, string[]> = {
  ask: ["ui-ux-mastery"],
  plan: ["product-flow", "ui-ux-mastery"],
  build: ["ui-ux-mastery", "motion-interaction", "anti-ai-slop"],
  verify: ["ui-ux-mastery", "anti-ai-slop", "motion-interaction"],
  fix: ["ui-ux-mastery", "backend-production"],
};

export function classifyIntentSync(prompt: string, context: RouterContext = {}): RouterDecision {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const framework = context.framework ?? "react-native";

  // If this is the first message for a brand new project, default to planning
  if (context.isNewProject && !context.hasSpec) {
    return {
      intent: "plan",
      model: INTENT_MODEL_MAP.plan,
      skills: INTENT_SKILLS_MAP.plan,
      tier: "manual",
      framework,
      confidence: 0.95,
      reasoning: "First interaction on a new project triggers the Plan spec gate.",
    };
  }

  // 1. Explicit Slash Commands
  if (trimmed.startsWith("/plan")) {
    return {
      intent: "plan",
      model: INTENT_MODEL_MAP.plan,
      skills: INTENT_SKILLS_MAP.plan,
      tier: "manual",
      framework,
      confidence: 1.0,
      reasoning: "Explicit /plan slash command invoked.",
    };
  }
  if (trimmed.startsWith("/ask") || trimmed.startsWith("/help")) {
    return {
      intent: "ask",
      model: INTENT_MODEL_MAP.ask,
      skills: INTENT_SKILLS_MAP.ask,
      tier: "yolo",
      framework,
      confidence: 1.0,
      reasoning: "Explicit /ask slash command invoked.",
    };
  }
  if (trimmed.startsWith("/verify") || trimmed.startsWith("/audit")) {
    return {
      intent: "verify",
      model: INTENT_MODEL_MAP.verify,
      skills: INTENT_SKILLS_MAP.verify,
      tier: "tier1",
      framework,
      confidence: 1.0,
      reasoning: "Explicit /verify slash command invoked.",
    };
  }
  if (trimmed.startsWith("/fix")) {
    return {
      intent: "fix",
      model: INTENT_MODEL_MAP.fix,
      skills: INTENT_SKILLS_MAP.fix,
      tier: "tier1",
      framework,
      confidence: 1.0,
      reasoning: "Explicit /fix slash command invoked.",
    };
  }

  // 2. Ask pattern matching (informational questions without code creation)
  const askPatterns = [
    /^(what|why|how|who|where|when|can you explain|explain|tell me about|difference between)\b/i,
    /\?$/,
    /^(summarize|describe|what does)\b/i,
  ];
  const isQuestion = askPatterns.some((pattern) => pattern.test(lower));
  const hasCodeKeywords =
    /\b(create|build|implement|write|add|generate|modify|fix|refactor|change|make)\b/i.test(lower);

  if (isQuestion && !hasCodeKeywords) {
    return {
      intent: "ask",
      model: INTENT_MODEL_MAP.ask,
      skills: INTENT_SKILLS_MAP.ask,
      tier: "yolo",
      framework,
      confidence: 0.92,
      reasoning: "Informational inquiry detected with no code modification requested.",
    };
  }

  // 3. Verify / Quality audit pattern matching
  const verifyPatterns =
    /\b(verify|audit|review ui|check design|token check|compare screenshot|a11y check|inspect)\b/i;
  if (verifyPatterns.test(lower)) {
    return {
      intent: "verify",
      model: INTENT_MODEL_MAP.verify,
      skills: INTENT_SKILLS_MAP.verify,
      tier: "tier1",
      framework,
      confidence: 0.9,
      reasoning: "Verification, design review, or token comparison intent detected.",
    };
  }

  // 4. Fix / Repair pattern matching
  const fixPatterns =
    /\b(fix|error|broken|failing|bug|crash|patch|repair|resolve issue|type error)\b/i;
  if (fixPatterns.test(lower)) {
    return {
      intent: "fix",
      model: INTENT_MODEL_MAP.fix,
      skills: INTENT_SKILLS_MAP.fix,
      tier: "tier1",
      framework,
      confidence: 0.9,
      reasoning: "Error diagnosis and repair intent detected.",
    };
  }

  // 5. Plan / Spec pattern matching
  const planPatterns =
    /\b(plan|spec|roadmap|architecture|user flows|specification|scope out|design flows)\b/i;
  if (planPatterns.test(lower)) {
    return {
      intent: "plan",
      model: INTENT_MODEL_MAP.plan,
      skills: INTENT_SKILLS_MAP.plan,
      tier: "manual",
      framework,
      confidence: 0.9,
      reasoning: "Feature planning and specification design intent detected.",
    };
  }

  // 6. Build / Code generation pattern matching
  const buildPatterns =
    /\b(create|build|implement|add|scaffold|generate|code|develop|make|integrate|wire|setup|style|render)\b/i;
  if (buildPatterns.test(lower)) {
    return {
      intent: "build",
      model: INTENT_MODEL_MAP.build,
      skills: INTENT_SKILLS_MAP.build,
      tier: "tier1",
      framework,
      confidence: 0.9,
      reasoning: "Active component or feature construction intent detected.",
    };
  }

  // 7. Ambiguous or short prompts: Low confidence fallback
  // RULE: Confidence < 0.7 defaults to "build" and flags for human checkpoint (tier: "manual")
  return {
    intent: "build",
    model: INTENT_MODEL_MAP.build,
    skills: INTENT_SKILLS_MAP.build,
    tier: "manual",
    framework,
    confidence: 0.5,
    reasoning:
      "Ambiguous prompt with confidence < 0.7; defaults to build with manual checkpoint confirmation.",
  };
}

export async function classifyIntent(
  prompt: string,
  context: RouterContext = {},
  llm?: FastLLMClassifier,
): Promise<RouterDecision> {
  const syncDecision = classifyIntentSync(prompt, context);

  // If high confidence or no LLM classifier provided, return immediately (<1ms)
  if (syncDecision.confidence >= 0.85 || !llm) {
    return syncDecision;
  }

  try {
    const llmDecision = await llm.classify(prompt, context);
    const intent = llmDecision.intent ?? syncDecision.intent;
    const confidence = llmDecision.confidence ?? 0.8;
    const tier = confidence < 0.7 ? "manual" : (llmDecision.tier ?? syncDecision.tier);

    return {
      intent,
      model: INTENT_MODEL_MAP[intent],
      skills: INTENT_SKILLS_MAP[intent],
      tier,
      framework: llmDecision.framework ?? syncDecision.framework,
      confidence,
      reasoning: llmDecision.reasoning ?? "Classified via fast LLM router pass.",
    };
  } catch {
    return syncDecision;
  }
}
