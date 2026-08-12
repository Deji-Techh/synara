import { describe, expect, it } from "vitest";

import {
  resolveCaideDesktopFlavor,
  CAIDE_CANARY_BUNDLE_ID,
  CAIDE_CANARY_DESKTOP_ENTRY_URL,
  CAIDE_CANARY_DESKTOP_ORIGIN,
  CAIDE_DESKTOP_ENTRY_URL,
  CAIDE_DESKTOP_ORIGIN,
  CAIDE_DESKTOP_UPDATE_CHANNEL,
  CAIDE_DEVELOPMENT_BUNDLE_ID,
  CAIDE_PRODUCTION_BUNDLE_ID,
  caideBundleId,
  caideDesktopIdentity,
} from "./desktopIdentity";

describe("desktopIdentity", () => {
  it("uses the exact canonical production and development bundle IDs", () => {
    expect(CAIDE_PRODUCTION_BUNDLE_ID).toBe("com.emanueledipietro.caide");
    expect(CAIDE_DEVELOPMENT_BUNDLE_ID).toBe("com.emanueledipietro.caide.dev");
    expect(caideBundleId(false)).toBe(CAIDE_PRODUCTION_BUNDLE_ID);
    expect(caideBundleId(true)).toBe(CAIDE_DEVELOPMENT_BUNDLE_ID);
  });

  it("uses the exact packaged renderer origin and entry URL", () => {
    expect(CAIDE_DESKTOP_ORIGIN).toBe("caide://app");
    expect(CAIDE_DESKTOP_ENTRY_URL).toBe("caide://app/index.html");
  });

  it("uses the isolated Caide desktop update channel", () => {
    expect(CAIDE_DESKTOP_UPDATE_CHANNEL).toBe("caide");
  });

  it("gives Canary a fully separate desktop identity and storage profile", () => {
    expect(CAIDE_CANARY_BUNDLE_ID).toBe("com.emanueledipietro.caide.canary");
    expect(CAIDE_CANARY_DESKTOP_ORIGIN).toBe("caide-canary://app");
    expect(CAIDE_CANARY_DESKTOP_ENTRY_URL).toBe("caide-canary://app/index.html");
    expect(caideDesktopIdentity("canary")).toEqual({
      flavor: "canary",
      displayName: "Caide Canary",
      bundleId: CAIDE_CANARY_BUNDLE_ID,
      scheme: "caide-canary",
      origin: CAIDE_CANARY_DESKTOP_ORIGIN,
      entryUrl: CAIDE_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "caide-canary",
      defaultHomeDirectoryName: ".caide-canary",
      usesScriptedUpdates: true,
    });
  });

  it("selects Canary explicitly without changing normal dev and production defaults", () => {
    expect(resolveCaideDesktopFlavor({ isDevelopment: false })).toBe("production");
    expect(resolveCaideDesktopFlavor({ isDevelopment: true })).toBe("development");
    expect(resolveCaideDesktopFlavor({ isDevelopment: false, requestedFlavor: " canary " })).toBe(
      "canary",
    );
    expect(resolveCaideDesktopFlavor({ isDevelopment: true, requestedFlavor: "canary" })).toBe(
      "canary",
    );
  });
});
