// FILE: providerInvariants.ts
// Purpose: Compose the `<provider_invariants>` prompt block from the
// connected database providers (Supabase / Neon). Donor pattern: Dyad
// injects `implementerProviderGuidance` (supabase_prompt / neon_prompt
// builders) into the local-agent and build prompts based on connection
// state; this module is the Caide seam for that composition.
// Donor builders: ../supabasePrompt + ../neonPrompt (verbatim).

import type { AppFrameworkType } from "./frameworkType.ts";
import {
  getSupabaseAvailableSystemPrompt,
  SUPABASE_DISCONNECTED_SYSTEM_PROMPT,
} from "./supabasePrompt.ts";
import { getNeonAvailableSystemPrompt, NEON_DISCONNECTED_SYSTEM_PROMPT } from "./neonPrompt.ts";

export interface ProviderInvariantOptions {
  /** Supabase project linked to the app. */
  hasSupabaseProject?: boolean;
  /** Client-code snippet injected into the available prompt. When absent, no available prompt is emitted. */
  supabaseClientCode?: string;
  /** Set false when the linked org's credentials are unavailable (emits the disconnected notice). */
  supabaseConnected?: boolean;
  /** Neon project linked to the app. */
  hasNeonProject?: boolean;
  /** Client-code snippet injected into the available prompt. When absent, no available prompt is emitted. */
  neonClientCode?: string;
  /** Set false when Neon credentials/branch context are unavailable (emits the disconnected notice). */
  neonConnected?: boolean;
  /** Donor framework type for the Neon framework-conditional builders (null → generic prompt). */
  neonFrameworkType?: AppFrameworkType | null;
  neonEmailVerificationEnabled?: boolean;
  neonNextjsMajorVersion?: number | null;
  /** True in local-agent turns (read_guide-first auth flow), false in build turns (inline guides). */
  neonLocalAgentMode?: boolean;
}

/**
 * Build the `<provider_invariants>` block content. Returns "" when no
 * provider is linked — callers append nothing, so default prompts are
 * byte-identical to before.
 */
export function buildProviderInvariants(options: ProviderInvariantOptions = {}): string {
  const blocks: string[] = [];

  if (options.hasSupabaseProject) {
    if (options.supabaseConnected === false) {
      blocks.push(SUPABASE_DISCONNECTED_SYSTEM_PROMPT);
    } else if (options.supabaseClientCode) {
      blocks.push(getSupabaseAvailableSystemPrompt(options.supabaseClientCode));
    }
  }

  if (options.hasNeonProject) {
    if (options.neonConnected === false) {
      blocks.push(NEON_DISCONNECTED_SYSTEM_PROMPT);
    } else if (options.neonClientCode) {
      blocks.push(
        getNeonAvailableSystemPrompt(options.neonClientCode, options.neonFrameworkType ?? null, {
          emailVerificationEnabled: options.neonEmailVerificationEnabled ?? false,
          nextjsMajorVersion: options.neonNextjsMajorVersion ?? null,
          isLocalAgentMode: options.neonLocalAgentMode ?? true,
          providerToolsAvailable: true,
        }),
      );
    }
  }

  return blocks.join("\n\n");
}
