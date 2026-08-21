import { describe, expect, it } from "vitest";

import { buildSocialAuthProviderPatch } from "./supabase_management_client";

describe("Supabase social auth configuration", () => {
  it("uses the provider-specific Management API keys", () => {
    expect(
      buildSocialAuthProviderPatch({
        provider: "discord",
        enabled: true,
        clientId: "discord-client",
        clientSecret: "discord-secret",
      }),
    ).toEqual({
      external_discord_enabled: true,
      external_discord_client_id: "discord-client",
      external_discord_secret: "discord-secret",
    });
  });

  it("disables a provider without resending credentials", () => {
    expect(
      buildSocialAuthProviderPatch({
        provider: "twitter",
        enabled: false,
        clientId: "must-not-be-sent",
        clientSecret: "must-not-be-sent",
      }),
    ).toEqual({
      external_twitter_enabled: false,
    });
  });
});
