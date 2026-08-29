// harness/frameworkStore.ts — M2 framework-immutable persistence (pure Caide, no dyad)
// Now backed by Sqlite via framework column on apps table — not just in-memory Map
// Falls back to Map for tests without DB

import type { ProjectFramework } from "./framework";
import { isFramework } from "./framework";

const memStore = new Map<string, ProjectFramework>();

// Pure Caide: now also persists to Sqlite apps.framework column when DB is available + file for restart
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

let dbLayer: { getFramework?: (id: string) => Promise<ProjectFramework | null>; setFramework?: (id: string, fw: ProjectFramework) => Promise<void> } | null = null;

export function setFrameworkDbLayer(layer: typeof dbLayer): void {
  dbLayer = layer;
}

export async function setFrameworkAsync(projectId: string, framework: ProjectFramework): Promise<void> {
  setFramework(projectId, framework);
  if (dbLayer?.setFramework) await dbLayer.setFramework(projectId, framework);
  // Also write to ~/caide-apps/.caide/framework.json for restart without DB
  try {
    const dir = join(homedir(), "caide-apps", projectId, ".caide");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "framework.json"), JSON.stringify({ framework }), "utf8");
  } catch {}
}

export async function getFrameworkFromFile(projectId: string): Promise<ProjectFramework | null> {
  try {
    const data = await readFile(join(homedir(), "caide-apps", projectId, ".caide", "framework.json"), "utf8");
    const parsed = JSON.parse(data) as { framework?: unknown };
    return isFramework(parsed.framework) ? parsed.framework : null;
  } catch {
    return null;
  }
}

export function setFramework(projectId: string, framework: ProjectFramework): void {
  if (memStore.has(projectId)) {
    const existing = memStore.get(projectId)!;
    if (existing !== framework) throw new Error(`Framework immutable for ${projectId}: ${existing} cannot become ${framework}`);
    return;
  }
  if (!isFramework(framework)) throw new Error(`Invalid framework: ${framework}`);
  memStore.set(projectId, framework);
  // Persist to Sqlite when layer is wired (M2 DB migration apps.framework)
  if (dbLayer?.setFramework) void dbLayer.setFramework(projectId, framework).catch(() => {});
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
