/**
 * Framework registry — immutable Blank|React-Native|Flutter|Website.
 * Controls scaffold, prompts, tools, preview, build, artifacts.
 */
export const ProjectFramework = ["blank", "react-native", "flutter", "website"] as const;
export type ProjectFramework = (typeof ProjectFramework)[number];

export type FrameworkDef = {
  scaffold: string;
  preview: "none" | "browser" | "device";
  build: string[];
};

export const frameworkRegistry: Record<ProjectFramework, FrameworkDef> = {
  blank: { scaffold: "empty", preview: "none", build: [] },
  "react-native": { scaffold: "expo", preview: "device", build: ["gradle assemble", "gradle bundle"] },
  flutter: { scaffold: "flutter", preview: "device", build: ["flutter build apk", "flutter build appbundle"] },
  website: { scaffold: "vite", preview: "browser", build: ["vite build"] },
};

export function isValidFramework(value: string): value is ProjectFramework {
  return (ProjectFramework as readonly string[]).includes(value);
}
