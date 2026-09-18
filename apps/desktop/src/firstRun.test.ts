// FILE: firstRun.test.ts
// Purpose: First-run marker + move-to-Applications gating.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAndMarkFirstRun, shouldOfferMoveToApplications } from "./firstRun";

describe("first run", () => {
  it("fires once per profile", () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "caide-firstrun-"));
    expect(checkAndMarkFirstRun(profile)).toBe(true);
    expect(checkAndMarkFirstRun(profile)).toBe(false);
  });

  it("offers the move prompt only for transient macOS installs", () => {
    const base = { platform: "darwin" as const, isDevelopment: false };
    expect(
      shouldOfferMoveToApplications({ ...base, execPath: "/Volumes/CAIDE/CAIDE.app/Contents/MacOS/CAIDE" }),
    ).toBe(true);
    expect(
      shouldOfferMoveToApplications({ ...base, execPath: "/Applications/CAIDE.app/Contents/MacOS/CAIDE" }),
    ).toBe(false);
    expect(
      shouldOfferMoveToApplications({
        platform: "linux",
        isDevelopment: false,
        execPath: "/tmp/x",
      }),
    ).toBe(false);
    expect(
      shouldOfferMoveToApplications({ ...base, isDevelopment: true, execPath: "/Volumes/X" }),
    ).toBe(false);
  });
});
