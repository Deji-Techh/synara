import {
  DEFAULT_MODEL_BY_PROVIDER,
  type AppCreateResult,
  type ModelSelection,
  type NativeApi,
  type OrchestrationShellSnapshot,
} from "@caide/contracts";
import { workspaceRootsEqual } from "@caide/shared/threadWorkspace";

import type { Project } from "../types";
import { deriveAppNameFromPrompt } from "./appNaming";
import { waitForSnapshotMatch } from "./projectCreateRecovery";

export interface FirstSendProjectTarget {
  targetProjectId: Project["id"];
  targetProjectKind: Project["kind"];
  targetProjectCwd: string;
  targetProjectScripts: Project["scripts"];
  targetProjectDefaultModelSelection: ModelSelection | null;
}

export interface FirstSendProjectCreation {
  workspaceRoot: string;
  title: string;
  kind: Project["kind"];
  createWorkspaceRootIfMissing: boolean;
  defaultModelSelection: ModelSelection;
}

/** A brand-new Flutter app created under ~/caide-apps for this first send. */
export interface FirstSendAppCreation {
  name: string;
}

export type FirstSendTargetResolution =
  | { kind: "current"; target: FirstSendProjectTarget }
  | { kind: "existing-project"; target: FirstSendProjectTarget }
  | { kind: "create-project"; creation: FirstSendProjectCreation }
  | { kind: "create-app"; creation: FirstSendAppCreation };

function buildProjectTarget(project: Project): FirstSendProjectTarget {
  return {
    targetProjectId: project.id,
    targetProjectKind: project.kind,
    targetProjectCwd: project.cwd,
    targetProjectScripts: project.kind === "project" ? project.scripts : [],
    targetProjectDefaultModelSelection: project.defaultModelSelection ?? null,
  };
}

function buildProjectTitleFromWorkspaceRoot(workspaceRoot: string): string {
  return workspaceRoot.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? workspaceRoot;
}

export function resolveFirstSendTarget(input: {
  activeProject: Project;
  createdAt: Date;
  isFirstMessage: boolean;
  isHomeChatContainer: boolean;
  projects: readonly Project[];
  selectedWorkspaceRoot: string | null;
  title: string;
  titleSeed: string;
  /** The composer's current provider/model pick, seeded into created projects. */
  composerModelSelection?: ModelSelection | null;
}): FirstSendTargetResolution {
  const {
    activeProject,
    isFirstMessage,
    isHomeChatContainer,
    projects,
    selectedWorkspaceRoot,
    title,
    titleSeed,
    composerModelSelection,
  } = input;

  if (!isFirstMessage || !isHomeChatContainer) {
    return {
      kind: "current",
      target: buildProjectTarget(activeProject),
    };
  }

  // Home-chat folder mentions intentionally escape the generic-chat workspace and become
  // normal projects. Plain prompts build a brand-new app: the product's first-class
  // send from Home is "describe it, and Caide scaffolds the Flutter app for you".
  if (!selectedWorkspaceRoot) {
    return {
      kind: "create-app",
      creation: {
        name: deriveAppNameFromPrompt(titleSeed || title),
      },
    };
  }

  const existingProject = projects.find(
    (project) =>
      project.kind === "project" && workspaceRootsEqual(project.cwd, selectedWorkspaceRoot),
  );
  if (existingProject) {
    return {
      kind: "existing-project",
      target: buildProjectTarget(existingProject),
    };
  }

  return {
    kind: "create-project",
    creation: {
      workspaceRoot: selectedWorkspaceRoot,
      title: buildProjectTitleFromWorkspaceRoot(selectedWorkspaceRoot),
      kind: "project",
      createWorkspaceRootIfMissing: false,
      // Seed the project with what the user actually picked; the historical
      // groq default only applies when the composer had no explicit selection.
      defaultModelSelection:
        composerModelSelection ??
        ({
          provider: "groq",
          model: DEFAULT_MODEL_BY_PROVIDER.groq,
        } satisfies ModelSelection),
    },
  };
}

const CREATE_APP_RETRY_DELAY_MS = 400;

/**
 * Creates the Flutter app a plain first-send from Home targets, retrying with
 * a numeric suffix when the derived name collides with an existing app folder.
 * Resolves once the orchestration read model publishes the bound project so
 * the in-flight send can promote its draft into it without a race.
 */
export async function createAppForFirstSend(input: {
  readonly api: NativeApi;
  readonly name: string;
  /** Composer model selection seeded into the created app project + thread. */
  readonly modelSelection?: ModelSelection;
}): Promise<{
  readonly projectId: Project["id"];
  readonly appPath: string;
  readonly snapshot: OrchestrationShellSnapshot | null;
}> {
  const { api } = input;
  let created: AppCreateResult | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4 && created === null; attempt += 1) {
    const candidateName = attempt === 0 ? input.name : `${input.name}-${attempt + 1}`.slice(0, 60);
    try {
      created = await api.app.createApp({
        name: candidateName,
        ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already exists")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CREATE_APP_RETRY_DELAY_MS));
    }
  }

  if (created === null) {
    throw lastError ?? new Error("The app could not be created.");
  }

  const { snapshot } = await waitForSnapshotMatch({
    loadSnapshot: () => api.orchestration.getShellSnapshot().catch(() => null),
    findMatch: (candidate) =>
      candidate.projects.find((project) => project.id === created?.projectId) ?? null,
    maxAttempts: 10,
    delayMs: 200,
  });

  return { projectId: created.projectId, appPath: created.appPath, snapshot };
}
