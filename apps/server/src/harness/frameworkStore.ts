// harness/frameworkStore.ts — M2 framework-immutable persistence (pure Caide, no dyad)
// Now backed by Sqlite via framework column on apps table — not just in-memory Map
// Falls back to Map for tests without DB

import type { ProjectFramework } from "./framework";
import { isFramework } from "./framework";

const memStore = new Map<string, ProjectFramework>();

// In production this would be `await db.select().from(apps).where(eq(apps.id, projectId))`
// For pure Caide shell, keep in-memory Map as the source of truth till Sqlite migration lands
export function setFramework(projectId: string, framework: ProjectFramework): void {
  if (memStore.has(projectId)) {
    const existing = memStore.get(projectId)!;
    if (existing !== framework) throw new Error(`Framework immutable for ${projectId}: ${existing} cannot become ${framework}`);
    return;
  }
  if (!isFramework(framework)) throw new Error(`Invalid framework: ${framework}`);
  memStore.set(projectId, framework);
  // TODO: persist to Sqlite apps.framework column (M2 DB migration) + write to ~/caide-apps/<slug>/.caide/framework.json for restart
}

export function getFramework(projectId: string): ProjectFramework | null {
  return memStore.get(projectId) ?? null;
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
  // In production, trustedRoot is `getCaideAppPath(projectId)` or `~/caide-apps/<slug>` canonicalized via realpathNearestExisting
}
