// FILE: firstRun.ts
// Purpose: First-run detection + macOS move-to-Applications prompt.
// Donor: dyad x caide first-run flag + move prompt (V1 comment: required
// for auto-update stickiness on macOS). Marker lives in userData so it
// survives updates but not profile wipes (correct: a wiped profile IS a
// first run).

import * as fs from "node:fs";
import * as path from "node:path";

const FIRST_RUN_MARKER = "caide-first-run-seen";

export function firstRunMarkerPath(userDataPath: string): string {
  return path.join(userDataPath, FIRST_RUN_MARKER);
}

/**
 * True on the very first launch for this profile. Marks immediately so a
 * crash during onboarding never re-triggers the first-run flow.
 */
export function checkAndMarkFirstRun(userDataPath: string): boolean {
  const marker = firstRunMarkerPath(userDataPath);
  try {
    if (fs.existsSync(marker)) return false;
  } catch {
    return false;
  }
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  } catch {
    // A read-only profile still boots; it just repeats first-run UX.
    return true;
  }
  return true;
}

/**
 * Whether the macOS move-to-Applications prompt applies: macOS only, not
 * a dev build, and the app is running from a transient location (DMG,
 * Downloads) rather than /Applications.
 */
export function shouldOfferMoveToApplications({
  platform,
  isDevelopment,
  execPath,
}: {
  platform: NodeJS.Platform;
  isDevelopment: boolean;
  execPath: string;
}): boolean {
  if (platform !== "darwin" || isDevelopment) return false;
  const normalized = execPath.replace(/\\/g, "/");
  if (normalized.includes("/Applications/")) return false;
  return (
    normalized.includes("/Volumes/") ||
    normalized.includes("/Downloads/") ||
    normalized.includes("/private/var/folders/")
  );
}
