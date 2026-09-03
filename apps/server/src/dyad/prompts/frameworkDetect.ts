// FILE: frameworkDetect.ts
// Purpose: Framework detection from workspace files (pure fs, testable).
// Extracted as a leaf module so both the turn context and the blueprint
// tool can use it without an import cycle.

import { normalizeCaideFramework, type CaideFramework } from "./framework.ts";

/** Framework detection from workspace files (pure fs, testable). */
export async function detectFrameworkFromDisk(appPath: string): Promise<CaideFramework | undefined> {
  const fs = await import("node:fs");
  try {
    const raw = fs.readFileSync(`${appPath}/.caide/framework.json`, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fw = normalizeCaideFramework(String(parsed.framework ?? "").toLowerCase());
    if (fw) return fw;
  } catch {
    // fall through to heuristics
  }
  try {
    if (fs.existsSync(`${appPath}/pubspec.yaml`)) return "flutter";
    const pkgRaw = fs.readFileSync(`${appPath}/package.json`, "utf8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, unknown>),
      ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
    };
    if (deps.expo || deps["react-native"] || deps["expo-status-bar"]) return "react-native";
    return "website";
  } catch {
    return undefined;
  }
}
