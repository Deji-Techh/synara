// harness/framework.ts — M2 framework-immutable registry (no dyad, just Caide)
export type ProjectFramework = "blank" | "react-native" | "flutter" | "website";

export interface FrameworkDef {
  readonly id: ProjectFramework;
  readonly label: string;
  readonly scaffold: string; // e.g. "blank" | "expo" | "flutter create" | "vite"
  readonly preview: "unavailable" | "browser" | "device";
  readonly buildTargets: readonly string[]; // apk/aab/ipa/web
  readonly prompts: readonly string[]; // skill pack ids
}

export const FRAMEWORKS: Record<ProjectFramework, FrameworkDef> = {
  blank: { id: "blank", label: "Blank", scaffold: "blank", preview: "unavailable", buildTargets: [], prompts: [] },
  "react-native": { id: "react-native", label: "React Native", scaffold: "expo", preview: "device", buildTargets: ["apk", "aab"], prompts: ["ui-ux-mastery", "anti-ai-slop"] },
  flutter: { id: "flutter", label: "Flutter", scaffold: "flutter create", preview: "device", buildTargets: ["apk", "aab", "ipa"], prompts: ["ui-ux-mastery"] },
  website: { id: "website", label: "Website", scaffold: "vite", preview: "browser", buildTargets: ["web"], prompts: ["ui-ux-mastery"] },
};

export function isFramework(v: unknown): v is ProjectFramework {
  return v === "blank" || v === "react-native" || v === "flutter" || v === "website";
}

export function trustedWorkspaceFor(projectId: string, workspaceRoot: string): string {
  // Server resolves trusted workspace — caller-supplied paths never trusted (M21 isolation)
  if (!workspaceRoot.startsWith("/")) throw new Error(`Untrusted workspace for ${projectId}: ${workspaceRoot}`);
  return workspaceRoot;
}
