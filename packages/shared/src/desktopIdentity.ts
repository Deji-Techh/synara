// FILE: desktopIdentity.ts
// Purpose: Defines the canonical desktop application identity across packaging and runtime.

export const CAIDE_DESKTOP_SCHEME = "caide";
export const CAIDE_DESKTOP_ORIGIN = `${CAIDE_DESKTOP_SCHEME}://app`;
export const CAIDE_DESKTOP_ENTRY_URL = `${CAIDE_DESKTOP_ORIGIN}/index.html`;
export const CAIDE_DESKTOP_UPDATE_CHANNEL = "caide";
export const CAIDE_PRODUCTION_BUNDLE_ID = "com.emanueledipietro.caide";
export const CAIDE_DEVELOPMENT_BUNDLE_ID = `${CAIDE_PRODUCTION_BUNDLE_ID}.dev`;
export const CAIDE_CANARY_BUNDLE_ID = `${CAIDE_PRODUCTION_BUNDLE_ID}.canary`;
export const CAIDE_CANARY_DESKTOP_SCHEME = "caide-canary";
export const CAIDE_CANARY_DESKTOP_ORIGIN = `${CAIDE_CANARY_DESKTOP_SCHEME}://app`;
export const CAIDE_CANARY_DESKTOP_ENTRY_URL = `${CAIDE_CANARY_DESKTOP_ORIGIN}/index.html`;

export type CaideDesktopFlavor = "production" | "development" | "canary";

export interface CaideDesktopIdentity {
  readonly flavor: CaideDesktopFlavor;
  readonly displayName: string;
  readonly bundleId: string;
  readonly scheme: string;
  readonly origin: string;
  readonly entryUrl: string;
  readonly userDataDirectoryName: string;
  readonly defaultHomeDirectoryName: string;
  readonly usesScriptedUpdates: boolean;
}

export function resolveCaideDesktopFlavor(input: {
  readonly isDevelopment: boolean;
  readonly requestedFlavor?: string | undefined;
}): CaideDesktopFlavor {
  if (input.requestedFlavor?.trim().toLowerCase() === "canary") {
    return "canary";
  }
  return input.isDevelopment ? "development" : "production";
}

export function caideDesktopIdentity(flavor: CaideDesktopFlavor): CaideDesktopIdentity {
  if (flavor === "canary") {
    return {
      flavor,
      displayName: "Caide Canary",
      bundleId: CAIDE_CANARY_BUNDLE_ID,
      scheme: CAIDE_CANARY_DESKTOP_SCHEME,
      origin: CAIDE_CANARY_DESKTOP_ORIGIN,
      entryUrl: CAIDE_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "caide-canary",
      defaultHomeDirectoryName: ".caide-canary",
      usesScriptedUpdates: true,
    };
  }
  if (flavor === "development") {
    return {
      flavor,
      displayName: "Caide (Dev)",
      bundleId: CAIDE_DEVELOPMENT_BUNDLE_ID,
      scheme: CAIDE_DESKTOP_SCHEME,
      origin: CAIDE_DESKTOP_ORIGIN,
      entryUrl: CAIDE_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "caide-dev",
      defaultHomeDirectoryName: ".caide",
      usesScriptedUpdates: false,
    };
  }
  return {
    flavor,
    displayName: "Caide",
    bundleId: CAIDE_PRODUCTION_BUNDLE_ID,
    scheme: CAIDE_DESKTOP_SCHEME,
    origin: CAIDE_DESKTOP_ORIGIN,
    entryUrl: CAIDE_DESKTOP_ENTRY_URL,
    userDataDirectoryName: "caide",
    defaultHomeDirectoryName: ".caide",
    usesScriptedUpdates: false,
  };
}

export function caideBundleId(isDevelopment: boolean): string {
  return caideDesktopIdentity(isDevelopment ? "development" : "production").bundleId;
}

/**
 * Env var the packaged desktop main injects into the backend process pointing
 * at the unpacked Flutter engine directory. The engine is a separate Node
 * program (better-sqlite3/node-pty native bindings) spawned by the server via
 * a plain `node` child process, which cannot read app.asar — so it must live
 * outside the archive (an electron-builder `extraResource`) and the server
 * resolves it through this env var rather than a bundled-relative path.
 *
 * Lives here (shared) so the desktop main (injects it), the server adapter
 * (reads it) and the packaging script (stages it) derive one constant instead
 * of drifting.
 */
export const CAIDE_ENGINE_DIR_ENV = "CAIDE_ENGINE_DIR";
