/**
 * Prompt registry — L0-L3 assembly.
 * Steal deepseek system-prompt registry (section/context/variable/tools + waterfall).
 */
export type PromptLayer = "L0" | "L1" | "L2" | "L3";
export type PromptSection = { name: string; order: number; text: string | (() => string) };
export type PromptContext = { name: string; order: number; text: string | (() => string) };

const sections = new Map<string, PromptSection>();

export function registerSection(section: PromptSection): () => void {
  sections.set(section.name, section);
  return () => sections.delete(section.name);
}

export function assemblePrompt(layers: Record<PromptLayer, string[]>): string {
  const ordered = Array.from(sections.values()).sort((a, b) => a.order - b.order);
  const base = ordered.map((s) => (typeof s.text === "function" ? s.text() : s.text)).join("\n\n");
  const l0 = layers.L0.join("\n");
  const l1 = layers.L1.join("\n");
  const l2 = layers.L2.join("\n");
  const l3 = layers.L3.join("\n");
  return [base, l0, l1, l2, l3].filter(Boolean).join("\n\n---\n\n");
}

// L0 Identity core — cached
export const L0_IDENTITY = `You are Caide — a pure harness that builds immutable Blank|React-Native|Flutter|Website apps.
Rules: never expose secrets, never bypass sandbox, always operate within current stage's allowed tools.
Output: typed envelopes {token,tool_call,stage,checkpoint,artifact_updated}. Verifier never sees Builder trace.`;
