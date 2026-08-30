import { describe, expect, it } from "vitest";

import {
  getAgentMentionAliases,
  getAgentMentionAutocompleteAliases,
  resolveAgentAlias,
} from "./agentMentions";

describe("agentMentions", () => {
  it("returns empty autocomplete for stripped providers (groq/opencode)", () => {
    expect(getAgentMentionAutocompleteAliases("groq")).toEqual([]);
    expect(getAgentMentionAutocompleteAliases("opencodeZen")).toEqual([]);
    expect(getAgentMentionAutocompleteAliases("opencodeGo")).toEqual([]);
  });

  it("resolves no alias for stripped providers", () => {
    expect(resolveAgentAlias("gpt-4o", "groq")).toBeNull();
    expect(resolveAgentAlias("sonnet", "opencodeZen")).toBeNull();
    expect(getAgentMentionAliases("groq")).toEqual([]);
  });
});
