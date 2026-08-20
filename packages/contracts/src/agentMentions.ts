/**
 * Agent Mentions - @alias(task) syntax for subagent delegation.
 *
 * Provides provider-aware alias metadata used by the composer UI and provider runtimes.
 */

import type { ProviderKind } from "./orchestration";
import type { ModelSlug } from "./model";

type AgentAliasColor = "violet" | "fuchsia" | "teal" | "cyan" | "amber" | "orange";

interface BaseAgentAliasDefinition {
  readonly provider: ProviderKind;
  readonly displayName: string;
  readonly color: AgentAliasColor;
}

export interface AgentAliasDefinition extends BaseAgentAliasDefinition {
  readonly provider: ProviderKind;
  readonly kind?: "model";
  readonly model: string;
  readonly description?: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
}

export type ResolvedAgentAlias = AgentAliasDefinition & {
  readonly alias: string;
};

export const AGENT_MENTION_ALIASES_BY_PROVIDER: Record<
  ProviderKind,
  Record<string, AgentAliasDefinition>
> = {
  engine: {},
  openai: {
    "gpt-4o": {
      provider: "openai",
      kind: "model",
      model: "gpt-4o",
      displayName: "GPT-4o",
      color: "teal",
    },
  },
  anthropic: {
    sonnet: {
      provider: "anthropic",
      kind: "model",
      model: "claude-3-5-sonnet",
      displayName: "Claude 3.5 Sonnet",
      color: "amber",
    },
  },
  google: {
    gemini: {
      provider: "google",
      kind: "model",
      model: "gemini-1.5-pro",
      displayName: "Gemini 1.5 Pro",
      color: "cyan",
    },
  },
  openrouter: {
    openrouter: {
      provider: "openrouter",
      kind: "model",
      model: "auto",
      displayName: "OpenRouter Auto",
      color: "violet",
    },
  },
  ollama: {
    llama3: {
      provider: "ollama",
      kind: "model",
      model: "llama3.1",
      displayName: "Llama 3.1",
      color: "orange",
    },
  },
  deepseek: {
    deepseek: {
      provider: "deepseek",
      kind: "model",
      model: "deepseek-coder",
      displayName: "DeepSeek Coder",
      color: "teal",
    },
  },
  groq: {
    groq: {
      provider: "groq",
      kind: "model",
      model: "llama-3.1-70b-versatile",
      displayName: "Llama 3.1 (Groq)",
      color: "fuchsia",
    },
  },
  mistral: {
    mistral: {
      provider: "mistral",
      kind: "model",
      model: "mistral-large-latest",
      displayName: "Mistral Large",
      color: "cyan",
    },
  },
  together: {
    together: {
      provider: "together",
      kind: "model",
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      displayName: "Llama 3.1 (Together)",
      color: "cyan",
    },
  },
  cohere: {
    cohere: {
      provider: "cohere",
      kind: "model",
      model: "command-r-plus",
      displayName: "Command R+",
      color: "violet",
    },
  },
  xai: {
    grok: {
      provider: "xai",
      kind: "model",
      model: "grok-2",
      displayName: "Grok 2",
      color: "amber",
    },
  },
  fireworks: {
    fireworks: {
      provider: "fireworks",
      kind: "model",
      model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
      displayName: "Llama 3.1 (Fireworks)",
      color: "orange",
    },
  },
  opencodeZen: {},
  opencodeGo: {},
} as const satisfies Record<ProviderKind, Record<string, AgentAliasDefinition>>;

// Backward compatibility for legacy call sites that still expect a flat alias table.
export const AGENT_MENTION_ALIASES: Record<string, AgentAliasDefinition> = Object.assign(
  {},
  ...Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER),
);

const AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER: Record<ProviderKind, readonly string[]> = {
  engine: [],
  openai: ["gpt-4o"],
  anthropic: ["sonnet"],
  google: ["gemini"],
  openrouter: ["openrouter"],
  ollama: ["llama3"],
  deepseek: ["deepseek"],
  groq: ["groq"],
  mistral: ["mistral"],
  together: ["together"],
  cohere: ["cohere"],
  xai: ["grok"],
  fireworks: ["fireworks"],
  opencodeZen: [],
  opencodeGo: [],
};

function mapAgentEntries(input: Record<string, AgentAliasDefinition>): ResolvedAgentAlias[] {
  return Object.entries(input)
    .map(([alias, definition]) => Object.assign({ alias }, definition))
    .toSorted((a, b) => a.alias.localeCompare(b.alias));
}

/**
 * Get all available agent aliases for a provider. When no provider is passed,
 * returns the global union for parsing and validation helpers.
 */
export function getAgentMentionAliases(provider?: ProviderKind): ResolvedAgentAlias[] {
  if (provider) {
    return mapAgentEntries(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }

  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    mapAgentEntries(definitions),
  );
}

/**
 * Get the preferred aliases shown in autocomplete for a provider.
 */
export function getAgentMentionAutocompleteAliases(provider: ProviderKind): ResolvedAgentAlias[] {
  return AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER[provider].map((alias) => {
    const definition = AGENT_MENTION_ALIASES_BY_PROVIDER[provider][alias];
    if (!definition) {
      throw new Error(`Unknown autocomplete alias for ${provider}: ${alias}`);
    }

    return Object.assign({ alias }, definition);
  });
}

/**
 * Resolve an agent alias. When a provider is passed, only provider-specific aliases are considered.
 */
export function resolveAgentAlias(
  alias: string,
  provider?: ProviderKind,
): AgentAliasDefinition | null {
  const normalized = alias.toLowerCase();
  if (provider) {
    return AGENT_MENTION_ALIASES_BY_PROVIDER[provider][normalized] ?? null;
  }

  for (const definitions of Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER)) {
    const resolved = definitions[normalized];
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export function isValidAgentAlias(alias: string, provider?: ProviderKind): boolean {
  return resolveAgentAlias(alias, provider) !== null;
}

export function getAgentAliasNames(provider?: ProviderKind): string[] {
  if (provider) {
    return Object.keys(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }

  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    Object.keys(definitions),
  );
}
