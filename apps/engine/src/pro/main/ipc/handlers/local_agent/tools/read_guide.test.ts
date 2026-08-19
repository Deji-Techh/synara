import { describe, expect, it } from "vitest";

import { getGuideContent, GUIDE_NAMES } from "./read_guide";

describe("production guide registry", () => {
  it("exposes the production capability guides", () => {
    expect(GUIDE_NAMES).toEqual(
      expect.arrayContaining([
        "add-authentication",
        "add-communications",
        "add-native-capability",
        "add-observability",
        "add-payments",
        "add-realtime-jobs",
        "add-social-auth",
        "add-storage-media",
        "build-secure-backend",
        "production-quality",
        "production-auth-authorization",
        "production-platform",
      ]),
    );
  });

  it.each([
    ["build-secure-backend", "Authenticate first"],
    ["add-communications", "idempotency keys"],
    ["add-observability", "Scrub authorization headers"],
    ["add-payments", "Verify the webhook signature"],
    ["add-realtime-jobs", "at-least-once execution"],
    ["add-social-auth", "signInWithOAuth"],
    ["add-storage-media", "signed upload URL"],
    ["add-native-capability", "permission"],
    ["production-quality", "Automated baseline"],
    ["production-auth-authorization", "tenant isolation"],
    ["production-platform", "liveness and readiness"],
  ])("loads %s through the runtime registry", (guide, expectedText) => {
    expect(getGuideContent(guide, "vite")).toContain(expectedText);
  });

  it("reports every available guide for an unknown name", () => {
    expect(() => getGuideContent("missing-guide", "vite")).toThrow(
      /Available guides:.*build-secure-backend.*production-quality/,
    );
  });
});
