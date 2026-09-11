// FILE: mcpProjectOverrides.ts
// Purpose: Per-project MCP server enable overlay (leaf module — no imports,
// so both harnessWs sync and settings/pane UI can use it without cycles).
// Registry (servers, secrets) stays global; only the enabled flag is
// overlaid per project workspace. Absent overlay entry = global value.

const OVERRIDES_KEY = "caide.mcp-project-overrides.v1";

/** serverId -> normalized workspace root -> enabled. */
export type McpProjectOverrides = Record<string, Record<string, boolean>>;

export function normalizeProjectRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

function readOverrides(): McpProjectOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as McpProjectOverrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadProjectOverrides(): McpProjectOverrides {
  return readOverrides();
}

export function setProjectServerEnabled(
  workspaceRoot: string,
  serverId: string,
  enabled: boolean,
  globalEnabled: boolean,
): McpProjectOverrides {
  const root = normalizeProjectRoot(workspaceRoot);
  const all = readOverrides();
  const perServer = { ...(all[serverId] ?? {}) };
  if (enabled === globalEnabled) {
    delete perServer[root];
    if (Object.keys(perServer).length === 0) delete all[serverId];
    else all[serverId] = perServer;
  } else {
    perServer[root] = enabled;
    all[serverId] = perServer;
  }
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
  } catch {
    // storage full/blocked — overlay skipped
  }
  return all;
}

export interface OverlayableMcpServer {
  id: string;
  enabled: boolean;
}

/** Apply the project overlay for a workspace; unknown workspace = unchanged. */
export function applyProjectOverrides<T extends OverlayableMcpServer>(
  servers: T[],
  workspaceRoot: string | null | undefined,
): T[] {
  if (!workspaceRoot) return servers;
  const root = normalizeProjectRoot(workspaceRoot);
  const all = readOverrides();
  let changed = false;
  const next = servers.map((s) => {
    const override = all[s.id]?.[root];
    if (override === undefined || override === s.enabled) return s;
    changed = true;
    return { ...s, enabled: override };
  });
  return changed ? next : servers;
}

/** Servers with a non-default overlay for a workspace (for badges). */
export function overriddenServerIds(workspaceRoot: string): string[] {
  const root = normalizeProjectRoot(workspaceRoot);
  const all = readOverrides();
  return Object.entries(all)
    .filter(([, perRoot]) => perRoot[root] !== undefined)
    .map(([id]) => id);
}
