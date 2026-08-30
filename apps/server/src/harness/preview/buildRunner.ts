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
  const tsErrorRegex = /([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*[:(](\d+)(?:,(\d+))?[):]\s*(?:error\s*[A-Z0-9]*:\s*)?(.*)/g;
  let match: RegExpExecArray | null;

  while ((match = tsErrorRegex.exec(combined)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[4]?.trim() || "Compilation error",
      rawError: match[0],
    });
  }

  if (errors.length === 0 && (stderr.trim().length > 0 || combined.includes("ERR") || combined.includes("Failed"))) {
    errors.push({
      message: stderr.trim() || "Build process exited with non-zero code.",
      rawError: combined.slice(0, 1000),
    });
  }

  return errors;
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
