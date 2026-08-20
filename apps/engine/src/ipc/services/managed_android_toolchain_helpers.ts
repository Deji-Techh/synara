import path from "node:path";

export interface AndroidProjectRequirements {
  compileSdk: number;
  buildToolsVersion: string;
  sdkPackages: string[];
}

const DEFAULT_COMPILE_SDK = 36;
const DEFAULT_BUILD_TOOLS = "36.0.0";

function firstNumberMatch(source: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

export function parseAndroidRequirementsFromSources(sources: string[]): AndroidProjectRequirements {
  const source = sources.join("\n");
  const compileSdk =
    firstNumberMatch(source, [
      /\bcompileSdk(?:Version)?\s*(?:=)?\s*(\d+)\b/m,
      /\bcompileSdk\s+rootProject\.ext\.compileSdkVersion\b[\s\S]*?\bcompileSdkVersion\s*=\s*(\d+)\b/m,
      /\bcompileSdk\s*=\s*libs\.versions\.compileSdk\.get\(\)[\s\S]*?\bcompileSdk\s*=\s*["']?(\d+)["']?/m,
    ]) ?? DEFAULT_COMPILE_SDK;

  const buildToolsVersion =
    source.match(/\bbuildToolsVersion\s*(?:=)?\s*["']([^"']+)["']/m)?.[1] ?? DEFAULT_BUILD_TOOLS;

  return {
    compileSdk,
    buildToolsVersion,
    sdkPackages: [
      "platform-tools",
      `platforms;android-${compileSdk}`,
      `build-tools;${buildToolsVersion}`,
    ],
  };
}

export function parseSdkManagerPercent(output: string): number | null {
  const matches = [...output.matchAll(/(?:^|\s)(\d{1,3})%/g)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  return Math.max(0, Math.min(100, Number.parseInt(raw, 10)));
}

export function safeArchiveEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe archive entry: ${entryName}`);
  }
  const resolved = path.posix.normalize(normalized);
  if (resolved === "." || resolved.startsWith("../")) {
    throw new Error(`Unsafe archive entry: ${entryName}`);
  }
  return resolved;
}
