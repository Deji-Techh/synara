// FILE: chatCreationTarget.ts
// Purpose: Steer new-chat intent toward Caide apps: chats start directly in
// app projects, while plain folders reroute into the create-app dialog (with
// an explicit escape hatch back to folder drafting).
// Layer: Web creation-policy helper (pure)
// Exports: resolveChatCreationTarget, ChatCreationTarget

import { isCaideAppProject } from "./caideApps";
import type { ServerWorkspacePaths } from "./serverWorkspacePaths";
import type { Project } from "../types";

export type ChatCreationTarget =
  | { kind: "thread"; projectId: Project["id"] }
  | { kind: "app-dialog"; projectId: Project["id"] };

export function resolveChatCreationTarget(
  project: Pick<Project, "id" | "cwd" | "kind"> | null | undefined,
  paths: ServerWorkspacePaths,
): ChatCreationTarget | null {
  if (!project) {
    return null;
  }
  if (isCaideAppProject(project, paths)) {
    return { kind: "thread", projectId: project.id };
  }
  return { kind: "app-dialog", projectId: project.id };
}
