// FILE: dispatchSystemPrompt.ts
// Purpose: Env escape hatch for the dispatch system prompt. When set,
// CAIDE_DISPATCH_SYSTEM_PROMPT (primary) or DYAD_DEFAULT_SYSTEM_PROMPT
// (alias) replaces the assembled base prompt wholesale at both dispatch
// sites (CaideRunner + legacy harnessCompat). Intended for low-token
// smoke tests and prompt iteration without rebuilding.
//
// Precedence: CAIDE_DISPATCH_SYSTEM_PROMPT > DYAD_DEFAULT_SYSTEM_PROMPT >
// assembled default. Empty/whitespace-only values count as unset.
// When the override is active, additive project context (APP_MEMORY.md
// block) is skipped so the dispatched system is exactly the override.
// Thread notes (project instructions ride the user history client-side)
// are unaffected — this only governs the system message.

export const DISPATCH_SYSTEM_PROMPT_ENV = "CAIDE_DISPATCH_SYSTEM_PROMPT";
export const DISPATCH_SYSTEM_PROMPT_ALIAS_ENV = "DYAD_DEFAULT_SYSTEM_PROMPT";

type EnvLike = Record<string, string | undefined>;

export function resolveDispatchSystemPromptOverride(env: EnvLike = process.env): string | null {
  const primary = (env[DISPATCH_SYSTEM_PROMPT_ENV] ?? "").trim();
  if (primary.length > 0) return primary;
  const alias = (env[DISPATCH_SYSTEM_PROMPT_ALIAS_ENV] ?? "").trim();
  return alias.length > 0 ? alias : null;
}

export function applyDispatchSystemPromptOverride(
  assembled: string,
  env: EnvLike = process.env,
): string {
  return resolveDispatchSystemPromptOverride(env) ?? assembled;
}
