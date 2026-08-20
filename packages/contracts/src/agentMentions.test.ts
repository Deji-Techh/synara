import { describe, expect, it } from "vitest";

import {
  getAgentMentionAliases,
  getAgentMentionAutocompleteAliases,
  resolveAgentAlias,
} from "./agentMentions";

describe("agentMentions", () => {
  it("shows one preferred alias per OpenAI model in autocomplete", () => {
    expect(getAgentMentionAutocompleteAliases("openai")).toEqual([
      {
        alias: "gpt-4o",
        provider: "openai",
        kind: "model",
        model: "gpt-4o",
        displayName: "GPT-4o",
        color: "teal",
      },
    ]);
  });

  it("shows provider-specific Anthropic aliases in autocomplete", () => {
    expect(getAgentMentionAutocompleteAliases("anthropic")).toEqual([
      {
        alias: "sonnet",
        provider: "anthropic",
        kind: "model",
        model: "claude-3-5-sonnet",
        displayName: "Claude 3.5 Sonnet",
        color: "amber",
      },
    ]);
  });

  it("keeps compatibility aliases resolvable even when hidden from autocomplete", () => {
    const openaiAlias = resolveAgentAlias("gpt-4o", "openai");
    const anthropicAlias = resolveAgentAlias("sonnet", "anthropic");

    expect(getAgentMentionAliases("openai").map(({ alias }) => alias)).toContain("gpt-4o");
    expect(getAgentMentionAliases("anthropic").map(({ alias }) => alias)).toContain("sonnet");

    expect(openaiAlias?.kind).toBe("model");
    expect(openaiAlias?.provider).toBe("openai");
    expect(openaiAlias?.kind === "model" ? openaiAlias.model : null).toBe("gpt-4o");
    expect(anthropicAlias?.kind).toBe("model");
    expect(anthropicAlias?.provider).toBe("anthropic");
    expect(anthropicAlias?.kind === "model" ? anthropicAlias.model : null).toBe(
      "claude-3-5-sonnet",
    );
  });
});
