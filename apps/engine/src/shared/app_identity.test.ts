import { describe, expect, it } from "vitest";

import {
  AppIdentitySchema,
  buildAppIdentityPrompt,
  defaultAppIdentity,
  parseStoredAppIdentity,
} from "./app_identity";

describe("App Identity", () => {
  it("derives safe complete defaults from a project name", () => {
    const identity = defaultAppIdentity("Busy Mantis — Skill");

    expect(identity.displayName).toBe("Busy Mantis — Skill");
    expect(identity.shortName).toBe("Busy Mantis — Skill");
    expect(identity.applicationId).toBe("com.caide.busymantisskill");
    expect(identity.deepLinkScheme).toBe("busymantisskill");
    expect(AppIdentitySchema.parse(identity)).toEqual(identity);
  });

  it("falls back safely when stored metadata is stale or malformed", () => {
    const identity = parseStoredAppIdentity(
      {
        version: 1,
        displayName: "",
        applicationId: "../../escape",
      },
      "Fallback App",
    );

    expect(identity).toEqual(defaultAppIdentity("Fallback App"));
  });

  it("injects native identifiers and the managed logo into agent context", () => {
    const identity = {
      ...defaultAppIdentity("Atlas"),
      applicationId: "com.example.atlas",
      iosBundleId: "com.example.atlas.ios",
      androidApplicationId: "com.example.atlas.android",
      logoPath: "public/caide-app-icon.png",
      logoUpdatedAt: "2026-07-25T21:00:00.000Z",
    };

    const prompt = buildAppIdentityPrompt(identity);

    expect(prompt).toContain("Display name: Atlas");
    expect(prompt).toContain("iOS bundle ID: com.example.atlas.ios");
    expect(prompt).toContain(
      "Android application ID: com.example.atlas.android",
    );
    expect(prompt).toContain("Managed app logo: public/caide-app-icon.png");
    expect(prompt).toContain("Treat these values as authoritative");
  });

  it.each([
    ["invalid shared ID", { applicationId: "example" }],
    ["invalid version", { versionName: "latest" }],
    ["invalid color", { accentColor: "blue" }],
    ["invalid deep link", { deepLinkScheme: "9bad" }],
  ])("rejects %s", (_label, overrides) => {
    expect(() =>
      AppIdentitySchema.parse({
        ...defaultAppIdentity("Atlas"),
        ...overrides,
      }),
    ).toThrow();
  });
});
