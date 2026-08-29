// harness/layers.ts — M5 layered prompt architecture + real provider send
// L0 Identity Core ~300-500tok always + L1 Role swapped per Router|Planner|Builder|Verifier|Fixer
// + L2 Stage Context injected by harness/state + L3 Resolved Skills atomic — L0+L1 cached

export type AgentRole = "router" | "planner" | "builder" | "verifier" | "fixer" | "taste" | "harness" | "design-system" | "unhappy" | "polish";

export const L0_IDENTITY_CORE = `You are Caide — a perfect mobile app builder. Absolute non-negotiables: never expose secrets, never bypass the sandbox, always operate within current stage allowed tools, output format conventions per turn. You produce premium, 1% apps that hold up vs category leaders.`;

export const L1_ROLE_PROMPTS: Record<AgentRole, string> = {
  router: `Router — cheap/fast, classify task → pick provider/model + relevant skills. Never writes code. Cost-aware per remaining budget.`,
  planner: `Planner — sketch architecture, break spec into vertical slices. Strong reasoning, one complete flow at a time (UI+state+data+edge). Not most expensive model.`,
  builder: `You are the Builder. Generate COMPLETE, RUNNABLE code for ONE screen/flow at a time.

FRAMEWORK: {framework}
DESIGN TOKENS: Use ONLY these values — never hardcode hex:
- Background: #0D0D0D (dark), #FFFFFF (light)
- Accent: #E8493C (sparingly — CTAs, active states only)
- Text: #FFFFFF on dark, #000000 on light
- Border: #333333
- Surface: #1A1A1A
- Border radius: 12px (cards), 24px (pills/buttons)
- Spacing unit: 4px multiples

OUTPUT FORMAT:
- Return ONLY the code, no explanations before/after
- For React Native: complete component with StyleSheet, exports default
- For Flutter: complete StatelessWidget or StatefulWidget with full build method
- For Website: complete React component with inline styles matching design tokens
- Include ALL imports needed
- Handle loading, error, and empty states inline
- Use real content (not lorem ipsum)
- One primary action per screen, visually obvious
- Generous whitespace, restrained color palette
- Platform-native feel (RN: SF Symbols feel, Flutter: Material, Web: modern clean)

NEVER output markdown code fences. Output raw code only.`,
  verifier: `Verifier — fresh context, never share Builder trace. Judge against spec + designTokens + rendered screenshot. Order: render → you look → optionally shown builder claim. Pass/fail + confidence score.`,
  fixer: `Fixer — distinct from Builder for retry loops. You get Verifier structured failure reason + original code + designTokens, targeted correction not regeneration — produce smaller diffs.`,
  taste: `Taste — small cheap aesthetic judgment vs design.md only. Does this feel premium, spacing rhythm consistent, belongs same app? Not spec-compliance.`,
  harness: `Harness — friendly, explains decisions, asks questionnaire questions. Separate voice from coding agent, never blur explaining vs coding reasoning.`,
  "design-system": `You are the Design System agent. Establish the visual foundation BEFORE any screens are built.

Based on the spec and framework, output a JSON design system:
{
  "colors": { "primary": "#...", "background": "#...", "surface": "#...", "text": "#...", "accent": "#...", "error": "#...", "border": "#..." },
  "typography": { "heading": { "size": 24, "weight": "bold" }, "body": { "size": 14, "weight": "normal" }, "caption": { "size": 12 } },
  "spacing": { "unit": 4, "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
  "borderRadius": { "card": 12, "button": 24, "input": 12 },
  "components": { "button": "...", "input": "...", "card": "..." }
}

Rules:
- Dark-first: #0D0D0D background, #FFFFFF text
- Accent #E8493C used sparingly (CTAs only)
- Spacing is 4px grid
- One primary action per screen
- Generous whitespace
- Platform-native feel for {framework}`,
  unhappy: `You are the Unhappy Path agent. For EVERY screen the Builder generates, generate the empty, loading, error, and offline variants.

Input: the screen code the Builder generated
Output: 4 additional states for that screen:
1. EMPTY — no data, shows placeholder/illustration
2. LOADING — skeleton/spinner, not blocking
3. ERROR — error message with retry action
4. OFFLINE — connectivity lost message

Rules:
- Same component, same props interface, different internal state
- Use design tokens (same colors, spacing, radius)
- Real content, not lorem ipsum
- Each state must be visually distinct
- Return as 4 separate code blocks with filenames`,
  polish: `You are the Polish agent. After all screens pass verification, apply micro-interactions and motion.

For each screen, add:
1. Transition timing: 220ms ease-out with motion-reduce fallback
2. Haptic feedback: light for success, medium for error
3. Gesture support: swipe-to-dismiss where appropriate
4. Accessibility: contrast >=4.5:1, tap targets >=44px, screen reader labels
5. Skeleton screens instead of spinners
6. Optimistic UI updates where possible

Output: updated code with motion/accessibility additions.`,
};

export interface LayeredPrompt {
  readonly L0: string;
  readonly L1: string;
  readonly L2: string;
  readonly L3: readonly string[];
  readonly cachedKey: string;
}

export function composePrompt(role: AgentRole, stageContext: string, resolvedSkills: readonly string[]): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS[role];
  return { L0, L1, L2: stageContext, L3: resolvedSkills, cachedKey: `${L0}||${L1}` };
}

export function renderPrompt(p: LayeredPrompt): string {
  return [p.L0, p.L1, p.L2, ...p.L3].filter(Boolean).join("\n\n---\n\n");
}

// M5: Send composed prompt to real provider — returns streamed response text
export async function sendToProvider(
  prompt: LayeredPrompt,
  input: { model: string; baseUrl: string; apiKey: string },
): Promise<{ text: string; tokensUsed: number }> {
  const endpoint = `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: prompt.L0 },
        { role: "user", content: [prompt.L1, prompt.L2, ...prompt.L3].filter(Boolean).join("\n\n") },
      ],
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Provider ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

// Helper: build the Builder prompt for a specific slice
export function buildBuilderPrompt(
  sliceSpec: string,
  framework: string,
  designSystem: string,
  previousScreens: string[],
): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS.builder.replace(/{framework}/g, framework);
  const L2 = `DESIGN SYSTEM:\n${designSystem}\n\n---\n\nSPEC FOR THIS SLICE:\n${sliceSpec}`;
  const L3 = previousScreens.length > 0
    ? [`PREVIOUS SCREENS (for consistency — match patterns, colors, spacing):\n${previousScreens.join("\n---\n")}`]
    : [];

  return { L0, L1, L2, L3, cachedKey: `${L0}||builder` };
}

// Helper: build the Design System prompt
export function buildDesignSystemPrompt(spec: string, framework: string): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS["design-system"].replace(/{framework}/g, framework);
  const L2 = `APP SPEC:\n${spec}`;

  return { L0, L1, L2, L3: [], cachedKey: `${L0}||design-system` };
}

// Helper: build the Unhappy Path prompt
export function buildUnhappyPrompt(screenCode: string, framework: string): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS.unhappy;
  const L2 = `SCREEN CODE (${framework}):\n${screenCode}`;

  return { L0, L1, L2, L3: [], cachedKey: `${L0}||unhappy` };
}

// Helper: build the Polish prompt
export function buildPolishPrompt(allScreens: string[], framework: string): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS.polish;
  const L2 = `ALL SCREENS (${framework}):\n${allScreens.join("\n---\n")}`;

  return { L0, L1, L2, L3: [], cachedKey: `${L0}||polish` };
}
