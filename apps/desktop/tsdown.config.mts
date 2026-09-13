// FILE: tsdown.config.ts
// Purpose: Builds Electron main/preload code and controls diagnostic source maps.
// Layer: Desktop build config
// Depends on: tsdown.

import { execSync } from "node:child_process";
import { defineConfig } from "tsdown";

const sourcemapEnv = process.env.CAIDE_DESKTOP_SOURCEMAP?.trim().toLowerCase();
const buildSourcemap = sourcemapEnv === "1" || sourcemapEnv === "true";
const windowsUpdaterPublisher = process.env.AZURE_TRUSTED_SIGNING_SUBJECT_DN?.trim() ?? "";

// Build stamp (mirrors apps/web/vite.config.ts): short commit hash so the
// backend env (and any About surface) identifies the exact running build.
function resolveCaideBuildSha(): string {
  const fromEnv = process.env.CAIDE_BUILD_SHA?.trim();
  if (fromEnv) return fromEnv;
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "dev"
    );
  } catch {
    return "dev";
  }
}
const CAIDE_BUILD_SHA = resolveCaideBuildSha();

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: buildSourcemap,
  outExtensions: () => ({ js: ".js" }),
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    // Electron exposes this builtin only at runtime; keeping it external avoids
    // asking Rolldown to resolve a package that intentionally does not exist.
    external: ["original-fs"],
    define: {
      __CAIDE_WINDOWS_UPDATER_PUBLISHER__: JSON.stringify(windowsUpdaterPublisher),
      __CAIDE_BUILD_SHA__: JSON.stringify(CAIDE_BUILD_SHA),
    },
    noExternal: (id) => id.startsWith("@caide/"),
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
]);
