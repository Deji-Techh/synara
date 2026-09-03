// FILE: sessionStores.ts
// Purpose: M3g — per-session server stores fed by the client's settings
// sync (tool approvals, MCP consents, safe-SQL, DB links) plus JSONL
// snapshot/restore for turn-scoped state (todos, titles, links). The WS
// layer delivers settings_sync here; CaideRunner restores at turn start and
// snapshots at turn end, so restarts lose nothing.

import { SessionStorage } from "../session/storage.ts";
import { linkDatabase, unlinkDatabase, getDatabaseLink, type DbLink } from "../../dyad/db/connections.ts";
import {
  MemoryConsentStore,
  type ToolConsent,
} from "../../dyad/tools/permissions.ts";
import { MemoryMcpConsentStore, type McpConsent } from "../../dyad/mcp/mcpConsent.ts";
import { getTodos, setTodos } from "../../dyad/plan/todoStore.ts";
import { getSessionTitle } from "../../dyad/misc/miscTools.ts";

export interface SettingsSyncPayload {
  toolConsents?: Record<string, ToolConsent>;
  safeSql?: boolean;
  mcpConsents?: Array<{ serverId: string | number; toolName: string; consent: McpConsent }>;
  mcpAutoApproveSafe?: boolean;
  dbLinks?: DbLink[];
}

export interface SessionStores {
  consent: MemoryConsentStore;
  mcp: MemoryMcpConsentStore;
  safeSql: boolean;
  mcpAutoApproveSafe: boolean;
}

const stores = new Map<string, SessionStores>();

export function getOrCreateSessionStores(sessionId: string): SessionStores {
  let entry = stores.get(sessionId);
  if (!entry) {
    entry = {
      consent: new MemoryConsentStore(),
      mcp: new MemoryMcpConsentStore(),
      safeSql: true,
      mcpAutoApproveSafe: true,
    };
    stores.set(sessionId, entry);
  }
  return entry;
}

export function clearSessionStores(sessionId: string): void {
  stores.delete(sessionId);
  unlinkDatabase(sessionId);
}

/** Apply a client settings_sync payload to the session stores. */
export function applySettingsSync(sessionId: string, payload: SettingsSyncPayload): SessionStores {
  const entry = getOrCreateSessionStores(sessionId);
  if (payload.toolConsents) {
    for (const [tool, consent] of Object.entries(payload.toolConsents)) {
      if (consent === "ask" || consent === "always" || consent === "never") {
        entry.consent.set(tool, consent);
      }
    }
  }
  if (typeof payload.safeSql === "boolean") entry.safeSql = payload.safeSql;
  if (typeof payload.mcpAutoApproveSafe === "boolean") {
    entry.mcpAutoApproveSafe = payload.mcpAutoApproveSafe;
  }
  if (payload.mcpConsents) {
    for (const c of payload.mcpConsents) {
      if (c.consent === "ask" || c.consent === "always" || c.consent === "denied") {
        entry.mcp.set(c.serverId, c.toolName, c.consent);
      }
    }
  }
  if (payload.dbLinks && payload.dbLinks.length > 0) {
    const first = payload.dbLinks[0];
    linkDatabase(sessionId, first);
  }
  return entry;
}

/** Persist turn-scoped state to the session JSONL log. */
export async function snapshotSessionState(
  sessionId: string,
  storage: SessionStorage = new SessionStorage(),
): Promise<void> {
  const entry = stores.get(sessionId);
  const consents: Record<string, ToolConsent> = entry ? entry.consent.entries() : {};
  await storage.append(sessionId, "session/state", {
    todos: getTodos(sessionId),
    title: getSessionTitle(sessionId),
    link: getDatabaseLink(sessionId) ?? null,
    toolConsents: consents,
    safeSql: entry?.safeSql ?? true,
  });
}

/** Rehydrate turn-scoped state from the session JSONL log (best-effort). */
export async function restoreSessionState(
  sessionId: string,
  storage: SessionStorage = new SessionStorage(),
): Promise<void> {
  const entries = await storage.readEntries(sessionId);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "session/state") continue;
    const data = entry.data as {
      todos?: unknown;
      link?: DbLink | null;
      toolConsents?: Record<string, unknown>;
      safeSql?: unknown;
    };
    if (Array.isArray(data.todos)) {
      setTodos(
        sessionId,
        (data.todos as Array<{ id: string; content: string; status: "pending" | "in_progress" | "completed" }>).filter(
          (t) => t && typeof t.id === "string",
        ),
      );
    }
    if (data.link && typeof data.link === "object") linkDatabase(sessionId, data.link);
    if (data.toolConsents && typeof data.toolConsents === "object") {
      const storesEntry = getOrCreateSessionStores(sessionId);
      for (const [tool, consent] of Object.entries(data.toolConsents)) {
        if (consent === "ask" || consent === "always" || consent === "never") {
          storesEntry.consent.set(tool, consent);
        }
      }
    }
    if (typeof data.safeSql === "boolean") {
      getOrCreateSessionStores(sessionId).safeSql = data.safeSql;
    }
    return;
  }
}
