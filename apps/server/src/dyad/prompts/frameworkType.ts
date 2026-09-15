// FILE: frameworkType.ts
// Purpose: App framework detection (types + disk detector) shared by prompt
// constructors. Donor: dyad x caide src/lib/framework_constants.ts (pure
// parts verbatim) + src/ipc/utils/framework_utils.ts (detector verbatim —
// pure node:fs, never throws; null when nothing matches).

import * as fs from "node:fs";
import * as path from "node:path";

export const APP_FRAMEWORK_TYPES = ["nextjs", "vite", "vite-nitro", "other"] as const;
export type AppFrameworkType = (typeof APP_FRAMEWORK_TYPES)[number];

export const NEXTJS_CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.cjs",
  "next.config.ts",
];

export const VITE_CONFIG_FILES = [
  "vite.config.js",
  "vite.config.ts",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.mts",
  "vite.config.cts",
];

/**
 * Whether Neon can be connected to this app. Neon supports Next.js and Vite
 * apps (Vite apps automatically get a Nitro server layer added on connect).
 */
export function isNeonSupportedFramework({
  files,
  frameworkType,
}: {
  files?: string[];
  frameworkType?: AppFrameworkType | null;
}): boolean {
  if (frameworkType) {
    return frameworkType === "nextjs" || frameworkType === "vite" || frameworkType === "vite-nitro";
  }

  if (!files) return false;
  return files.some(
    (file) => NEXTJS_CONFIG_FILES.includes(file) || VITE_CONFIG_FILES.includes(file),
  );
}

const NITRO_CONFIG_FILES = ["nitro.config.ts", "nitro.config.js", "nitro.config.mjs"];

/**
 * Detect the framework type for an app by checking config files and
 * package.json. Vite apps with a Nitro server layer (added via
 * `enable_nitro`) report as `"vite-nitro"`. Null when nothing matches.
 */
export function detectFrameworkType(appPath: string): AppFrameworkType | null {
  try {
    for (const config of NEXTJS_CONFIG_FILES) {
      if (fs.existsSync(path.join(appPath, config))) {
        return "nextjs";
      }
    }

    let isVite = false;
    for (const config of VITE_CONFIG_FILES) {
      if (fs.existsSync(path.join(appPath, config))) {
        isVite = true;
        break;
      }
    }

    let packageJsonDeps: Record<string, string> | null = null;
    const packageJsonPath = path.join(appPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps: Record<string, string> = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      packageJsonDeps = deps;
      if (!isVite && deps.next) return "nextjs";
      if (!isVite && deps.vite) isVite = true;
    }

    if (isVite) {
      return hasNitro(appPath, packageJsonDeps) ? "vite-nitro" : "vite";
    }

    return "other";
  } catch {
    return null;
  }
}

function hasNitro(appPath: string, deps: Record<string, string> | null): boolean {
  for (const config of NITRO_CONFIG_FILES) {
    if (fs.existsSync(path.join(appPath, config))) return true;
  }
  return Boolean(deps?.nitro);
}

/**
 * Read the Next.js major version from the app's package.json. Null when
 * next is not installed or the version string is non-numeric ("latest",
 * "canary", a git URL).
 */
export function detectNextJsMajorVersion(appPath: string): number | null {
  try {
    const packageJsonPath = path.join(appPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const nextVersion = packageJson.dependencies?.next ?? packageJson.devDependencies?.next;
    if (typeof nextVersion !== "string") {
      return null;
    }
    const match = nextVersion.match(/\d+/);
    if (!match) {
      return null;
    }
    return parseInt(match[0], 10);
  } catch {
    return null;
  }
}
