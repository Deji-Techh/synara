import type { ProjectFramework } from "@caide/contracts";
import { getFrameworkConfig } from "../framework/registry.ts";

export interface PreviewInfo {
  framework: ProjectFramework;
  previewAvailable: boolean;
  mode: "none" | "browser" | "device-frame";
  url?: string;
  message?: string;
}

export interface StructuredBuildError {
  file?: string;
  line?: number;
  message: string;
  rawError?: string;
}

export interface BuildCheckResult {
  success: boolean;
  framework: ProjectFramework;
  errors: StructuredBuildError[];
  stdout?: string;
  stderr?: string;
}

export function parseBuildErrors(stderr: string, stdout = ""): StructuredBuildError[] {
  const combined = `${stderr}\n${stdout}`;
  const errors: StructuredBuildError[] = [];

  // Match TypeScript / Vite error patterns: src/App.tsx(10,5): error TS2322: ...
  const tsErrorRegex =
    /([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*[:(](\d+)(?:,(\d+))?[):]\s*(?:error\s*[A-Z0-9]*:\s*)?(.*)/g;
  let match: RegExpExecArray | null;

  while ((match = tsErrorRegex.exec(combined)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[4]?.trim() || "Compilation error",
      rawError: match[0],
    });
  }

  if (
    errors.length === 0 &&
    (stderr.trim().length > 0 || combined.includes("ERR") || combined.includes("Failed"))
  ) {
    errors.push({
      message: stderr.trim() || "Build process exited with non-zero code.",
      rawError: combined.slice(0, 1000),
    });
  }

  return errors;
}

const METRO_RESOLVE_PATTERN = /Unable to resolve\s+([^\s]+)\s+from\s+([^\s:]+)(?::(\d+))?/i;
const TRANSFORM_ERROR_PATTERN =
  /(TransformError|SyntaxError|ReferenceError|TypeError)\s*:?\s*([^\n]{1,300})/i;
const TRANSFORM_LOCATION_PATTERN = /([a-zA-Z0-9_\-./]+\.(?:tsx?|jsx?|js))(?:[:(](\d+))?/;
const FLUTTER_RUN_PATTERN =
  /(?:No (?:devices|connected devices)|flutter: command not found|Could not resolve|Target .* not found|Gradle (?:build|task).*failed|CocoaPods?.*(?:not installed|failed)|Dart SDK (?:not found|version))/i;
const EXPO_TUNNEL_PATTERN =
  /Tunnel URL not found|expo (?:start )?(?:failed|crashed)| packing failed|Metro (?:bundler )?(?:crashed|encountered an error)/i;

/**
 * Structured boot-error parser for dev-server output (item 3): Metro
 * resolution/transform failures, Flutter tool failures, Expo crashes.
 * Returns file:line:suggestion findings; empty when nothing matches.
 */
export function parseBootErrors(logText: string): StructuredBuildError[] {
  const errors: StructuredBuildError[] = [];
  const seen = new Set<string>();
  const push = (entry: StructuredBuildError) => {
    const key = `${entry.file ?? ""}:${entry.line ?? 0}:${entry.message.slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(entry);
  };
  // Last file:line seen — Metro prints locations on continuation lines, so
  // look both back and ahead when an error line carries no location itself.
  let lastLocation: { file: string; line?: number } | null = null;
  const noteLocation = (line: string) => {
    const match = TRANSFORM_LOCATION_PATTERN.exec(line);
    if (match?.[1]) {
      lastLocation = {
        file: match[1],
        ...(match[2] ? { line: parseInt(match[2], 10) } : {}),
      };
    }
  };
  const lines = logText.split("\n");
  const peekLocation = (index: number): { file: string; line?: number } | null => {
    for (let j = index + 1; j < Math.min(index + 4, lines.length); j++) {
      const match = TRANSFORM_LOCATION_PATTERN.exec(
        (lines[j] ?? "").replace(/\u001b\[[0-9;]*m/g, ""),
      );
      if (match?.[1]) {
        return { file: match[1], ...(match[2] ? { line: parseInt(match[2], 10) } : {}) };
      }
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\u001b\[[0-9;]*m/g, "");
    let match: RegExpExecArray | null;
    if ((match = METRO_RESOLVE_PATTERN.exec(line))) {
      lastLocation = null;
      push({
        file: match[2]?.replace(/:$/, ""),
        ...(match[3] ? { line: parseInt(match[3], 10) } : {}),
        message: `Metro cannot resolve module "${match[1]}" — install it or fix the import path.`,
        rawError: line.trim().slice(0, 500),
      });
      continue;
    }
    if ((match = TRANSFORM_ERROR_PATTERN.exec(line))) {
      const inline = TRANSFORM_LOCATION_PATTERN.exec(line);
      const location = inline
        ? {
            file: inline[1] as string,
            ...(inline[2] ? { line: parseInt(inline[2], 10) } : {}),
          }
        : (peekLocation(i) ?? lastLocation);
      lastLocation = null;
      push({
        ...(location?.file ? { file: location.file } : {}),
        ...(location?.line ? { line: location.line } : {}),
        message: `Bundler error (${match[1]}): ${match[2]?.trim() ?? "transform failed"}.`,
        rawError: line.trim().slice(0, 500),
      });
      continue;
    }
    noteLocation(line);
    if (FLUTTER_RUN_PATTERN.test(line)) {
      push({
        message: `Flutter tool failure: ${line.trim().slice(0, 300)} — check flutter doctor, connected devices, and pubspec dependencies.`,
        rawError: line.trim().slice(0, 500),
      });
      continue;
    }
    if (EXPO_TUNNEL_PATTERN.test(line)) {
      push({
        message: `Expo/Metro crash: ${line.trim().slice(0, 300)} — restart the preview; clear cache on repeat failures.`,
        rawError: line.trim().slice(0, 500),
      });
    }
  }
  return errors.slice(0, 10);
}

export class BuildRunner {
  /**
   * Returns authoritative preview configuration and URL for the given framework.
   */
  static getPreviewInfo(framework: ProjectFramework, port = 5173): PreviewInfo {
    const config = getFrameworkConfig(framework);

    switch (framework) {
      case "react-native":
        return {
          framework,
          previewAvailable: true,
          mode: "device-frame",
          url: `http://localhost:${port || 8081}`,
          message: "React Native Expo device preview active.",
        };

      case "flutter":
        return {
          framework,
          previewAvailable: true,
          mode: "device-frame",
          url: `http://localhost:${port || 8080}`,
          message: "Flutter web-server preview active.",
        };

      case "website":
        return {
          framework,
          previewAvailable: true,
          mode: "browser",
          url: `http://localhost:${port || 5173}`,
          message: "Website live dev server active.",
        };

      case "blank":
      default:
        return {
          framework,
          previewAvailable: false,
          mode: "none",
          message: "Preview not available for Blank projects.",
        };
    }
  }
}
