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
import {
  clearPlanRecords,
  getAcceptedPlan,
  setAcceptedPlan,
  type PlanRecord,
} from "../../dyad/plan/planStore.ts";
import { getSessionTitle } from "../../dyad/misc/miscTools.ts";
import {
  DEFAULT_AGENT_ROUTING,
  normalizeAgentRouting,
  type AgentRoutingConfig,
} from "../../dyad/providers/agentRouting.ts";

export interface SettingsSyncPayload {
  toolConsents?: Record<string, ToolConsent>;
  safeSql?: boolean;
  mcpConsents?: Array<{ serverId: string | number; toolName: string; consent: McpConsent }>;
  mcpAutoApproveSafe?: boolean;
  dbLinks?: DbLink[];
  /** Per-step model routing (single vs scout/builder/planner); validated on apply. */
  agentRouting?: unknown;
  /** Client MCP server configs (web settings shape); manager syncs + feeds the registry. */
  mcpServers?: Array<{
    id: string;
    name: string;
    transport: "stdio" | "sse" | "oauth";
    enabled: boolean;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    defaultConsent?: "ask" | "always" | "never";
  }>;
}

export interface SessionStores {
  consent: MemoryConsentStore;
  mcp: MemoryMcpConsentStore;
  safeSql: boolean;
  mcpAutoApproveSafe: boolean;
  routing: AgentRoutingConfig;
}

const stores = new Map<string, SessionStores>();

/** sessionId -> appPath registry (appPath arrives per turn; no persistence needed). */
const sessionApps = new Map<string, string>();

/** Record which app a session belongs to (called on every turn start). */
export function noteSessionApp(sessionId: string, appPath: string): void {
  if (appPath) sessionApps.set(sessionId, appPath);
}

/** Look up the app a session belongs to, if known. */
export function getSessionApp(sessionId: string): string | undefined {
  return sessionApps.get(sessionId);
}

/** Forget a session's app mapping (session teardown). */
export function clearSessionApp(sessionId: string): void {
  sessionApps.delete(sessionId);
}

export function getOrCreateSessionStores(sessionId: string): SessionStores {
  let entry = stores.get(sessionId);
  if (!entry) {
    entry = {
      consent: new MemoryConsentStore(),
      mcp: new MemoryMcpConsentStore(),
      safeSql: true,
      mcpAutoApproveSafe: true,
      routing: {
        mode: DEFAULT_AGENT_ROUTING.mode,
        steps: {
          scout: { ...DEFAULT_AGENT_ROUTING.steps.scout },
          builder: { ...DEFAULT_AGENT_ROUTING.steps.builder },
          planner: { ...DEFAULT_AGENT_ROUTING.steps.planner },
        },
        fallbacks: [],
      },
    };
    stores.set(sessionId, entry);
  }
  return entry;
}

export function clearSessionStores(sessionId: string): void {
  stores.delete(sessionId);
  clearPlanRecords(sessionId);
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
  if (payload.agentRouting !== undefined) {
    entry.routing = normalizeAgentRouting(payload.agentRouting);
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
  const accepted = getAcceptedPlan(sessionId);
  await storage.append(sessionId, "session/state", {
    todos: getTodos(sessionId),
    title: getSessionTitle(sessionId),
    link: getDatabaseLink(sessionId) ?? null,
    toolConsents: consents,
    safeSql: entry?.safeSql ?? true,
    agentRouting: entry?.routing ?? DEFAULT_AGENT_ROUTING,
    // Bounded handoff record (no full plan text — re-read from the file).
    acceptedPlan: accepted
      ? {
          id: accepted.id,
          title: accepted.title,
          summary: accepted.summary,
          file: accepted.file ?? null,
          acceptedAt: accepted.acceptedAt ?? null,
        }
      : null,
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
      agentRouting?: unknown;
      acceptedPlan?: {
        id?: unknown;
        title?: unknown;
        summary?: unknown;
        file?: unknown;
        acceptedAt?: unknown;
      } | null;
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
    if (data.agentRouting !== undefined) {
      getOrCreateSessionStores(sessionId).routing = normalizeAgentRouting(data.agentRouting);
    }
    if (data.acceptedPlan && typeof data.acceptedPlan === "object") {
      const p = data.acceptedPlan;
      if (typeof p.id === "string" && typeof p.title === "string") {
        const record: PlanRecord = {
          id: p.id,
          title: p.title,
          summary: typeof p.summary === "string" ? p.summary : "",
          plan: "",
          status: "accepted",
          createdAt: 0,
          acceptedAt: typeof p.acceptedAt === "number" ? p.acceptedAt : undefined,
          file: typeof p.file === "string" ? p.file : undefined,
        };
        setAcceptedPlan(sessionId, record);
      }
    }
    return;
  }
}
