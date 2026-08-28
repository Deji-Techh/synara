// harness/frameworkStore.ts — M2 framework-immutable persistence (no dyad)
// Persists ProjectFramework on apps table, rejects mutation, validates per M2

import type { ProjectFramework } from "./framework";
import { isFramework } from "./framework";

const store = new Map<string, ProjectFramework>();

export function setFramework(projectId: string, framework: ProjectFramework): void {
  if (store.has(projectId)) {
    const existing = store.get(projectId)!;
    if (existing !== framework) throw new Error(`Framework immutable for ${projectId}: ${existing} cannot become ${framework}`);
    return;
  }
  if (!isFramework(framework)) throw new Error(`Invalid framework: ${framework}`);
  store.set(projectId, framework);
}

export function getFramework(projectId: string): ProjectFramework | null {
  return store.get(projectId) ?? null;
}

export function mustGetFramework(projectId: string): ProjectFramework {
  const f = getFramework(projectId);
  if (!f) throw new Error(`No framework for ${projectId}`);
  return f;
}

// Preview/build isolation: server resolves trusted workspace, rejects caller paths (M21)
export function assertTrustedWorkspace(projectId: string, workspaceRoot: string, trustedRoot: string): void {
  if (!workspaceRoot.startsWith(trustedRoot)) {
    throw new Error(`Untrusted workspace for ${projectId}: ${workspaceRoot} not under ${trustedRoot}`);
  }
}
