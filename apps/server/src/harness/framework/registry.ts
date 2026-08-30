import type { ProjectFramework } from "@caide/contracts";
import { scaffoldReactNative } from "../scaffold/react-native.ts";
import { scaffoldFlutter } from "../scaffold/flutter.ts";
import { scaffoldWebsite } from "../scaffold/website.ts";
import { scaffoldBlank } from "../scaffold/blank.ts";

export class FrameworkImmutableError extends Error {
  constructor(current: string, requested: string) {
    super(
      `Project framework is immutable! Current: '${current}', Requested change to: '${requested}'. Re-create project to use a different framework.`,
    );
    this.name = "FrameworkImmutableError";
  }
}

export interface FrameworkConfig {
  id: ProjectFramework;
  name: string;
  preview: "none" | "browser" | "device-frame";
  devCommand: string;
  buildSteps: string[];
  allowedTools: string[];
  skills: string[];
  artifactExtensions: string[];
  scaffold: (root: string, appName?: string) => Promise<string[]>;
}

export const frameworkRegistry: Record<ProjectFramework, FrameworkConfig> = {
  "react-native": {
    id: "react-native",
    name: "React Native (Expo)",
    preview: "device-frame",
    devCommand: "npx expo start",
    buildSteps: ["npx expo export"],
    allowedTools: ["read_file", "write_file", "list_dir", "search_files", "run_command", "install_package", "build_project", "lint_project"],
    skills: ["ui-ux-mastery", "platform-patterns", "motion-interaction", "product-flow", "anti-ai-slop"],
    artifactExtensions: [".tsx", ".ts", ".js", ".json"],
    scaffold: scaffoldReactNative,
  },
  flutter: {
    id: "flutter",
    name: "Flutter",
    preview: "device-frame",
    devCommand: "flutter run -d web-server",
    buildSteps: ["flutter build apk"],
    allowedTools: ["read_file", "write_file", "list_dir", "search_files", "run_command", "build_project"],
    skills: ["ui-ux-mastery", "platform-patterns", "motion-interaction", "product-flow"],
    artifactExtensions: [".dart", ".yaml", ".json"],
    scaffold: scaffoldFlutter,
  },
  website: {
    id: "website",
    name: "Website (Vite + React)",
    preview: "browser",
    devCommand: "bun run dev",
    buildSteps: ["bun run build"],
    allowedTools: ["read_file", "write_file", "list_dir", "search_files", "run_command", "install_package", "build_project", "lint_project"],
    skills: ["ui-ux-mastery", "motion-interaction", "product-flow", "anti-ai-slop"],
    artifactExtensions: [".tsx", ".ts", ".html", ".css", ".json"],
    scaffold: scaffoldWebsite,
  },
  blank: {
    id: "blank",
    name: "Blank Project",
    preview: "none",
    devCommand: "",
    buildSteps: [],
    allowedTools: ["read_file", "write_file", "list_dir", "search_files", "run_command"],
    skills: ["ui-ux-mastery"],
    artifactExtensions: [".ts", ".js", ".md"],
    scaffold: scaffoldBlank,
  },
};

export function getFrameworkConfig(framework: ProjectFramework): FrameworkConfig {
  return frameworkRegistry[framework] ?? frameworkRegistry.blank;
}

export function assertFrameworkImmutable(
  existing: ProjectFramework,
  incoming: ProjectFramework,
): void {
  if (existing !== incoming) {
    throw new FrameworkImmutableError(existing, incoming);
  }
}
