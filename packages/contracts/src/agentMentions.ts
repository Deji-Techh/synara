/**
 * Agent Mentions - @alias(task) syntax for subagent delegation.
 *
 * Stripped to groq / opencodeZen / opencodeGo + engine only.
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
  groq: {},
  opencodeZen: {},
  opencodeGo: {},
};

export const AGENT_MENTION_ALIASES = Object.fromEntries(
  Object.entries(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap(([provider, aliases]) =>
    Object.entries(aliases).map(([alias, def]) => [alias, def]),
  ),
);

const AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER: Record<ProviderKind, readonly string[]> = {
  engine: [],
  groq: [],
  opencodeZen: [],
  opencodeGo: [],
};

function mapAgentEntries(input: Record<string, AgentAliasDefinition>): ResolvedAgentAlias[] {
  return Object.entries(input)
    .map(([alias, definition]) => Object.assign({ alias }, definition))
    .toSorted((a, b) => a.alias.localeCompare(b.alias));
}

export function getAgentMentionAliases(provider?: ProviderKind): ResolvedAgentAlias[] {
  if (provider) {
    return mapAgentEntries(AGENT_MENTION_ALIASES_BY_PROVIDER[provider]);
  }
  return Object.values(AGENT_MENTION_ALIASES_BY_PROVIDER).flatMap((definitions) =>
    mapAgentEntries(definitions),
  );
}

export function getAgentMentionAutocompleteAliases(provider: ProviderKind): ResolvedAgentAlias[] {
  return AGENT_MENTION_AUTOCOMPLETE_ALIASES_BY_PROVIDER[provider].map((alias) => {
    const definition = AGENT_MENTION_ALIASES_BY_PROVIDER[provider][alias];
    if (!definition) {
      throw new Error(`Unknown autocomplete alias for ${provider}: ${alias}`);
    }
    return Object.assign({ alias }, definition);
  });
}

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
