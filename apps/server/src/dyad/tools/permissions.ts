// FILE: permissions.ts
// Purpose: Agent tool consent model — per-tool ask/always/never, SQL
// auto-approve, renderer consent round-trip, and turn tool-set inclusion.
// Donor: dyad x caide tool_definitions.ts consent section + shouldIncludeTool
// (verbatim semantics) with Electron/settings stripped out:
// - settings disk → injected ConsentStore (WS/persistence layer provides).
// - `event.sender.send("agent-tool:consent-request")` → injected
//   ConsentRequestFn (WS layer provides in M3).
// - `freeModelMode`/`usesEngineEndpoint` gating REMOVED (free-entirely);
//   `basicAgentMode` kept as a compat no-op (donor set is empty).
// - `chatId: number` → `sessionId: string` (Caide session model).

import {
  APP_BLUEPRINT_TOOLS,
  BUILD_PROFILE_TOOLS,
  CAPABILITY_GATED_BLUEPRINT_TOOLS,
  getDefaultConsent,
  getToolMeta,
  PLANNING_SPECIFIC_TOOLS,
  PLAN_MODE_ONLY_TOOLS,
  TOOL_CATALOG,
  type ToolConsent,
} from "./toolCatalog.ts";
import { randomUUID } from "node:crypto";
import { checkToolDanger, type DangerCheckResult } from "./dangerCheck.ts";

export interface SqlConsentMetadata {
  sqlMutatesSchema?: boolean;
  sqlDeletesData?: boolean;
}

/** Persistent consent overrides. M3 backs this with settings/SQLite. */
export interface ConsentStore {
  get(toolName: string): ToolConsent | undefined;
  set(toolName: string, consent: ToolConsent): void;
}

export class MemoryConsentStore implements ConsentStore {
  private map = new Map<string, ToolConsent>();
  get(toolName: string): ToolConsent | undefined {
    return this.map.get(toolName);
  }
  set(toolName: string, consent: ToolConsent): void {
    this.map.set(toolName, consent);
  }
  entries(): Record<string, ToolConsent> {
    return Object.fromEntries(this.map);
  }
}

export type ConsentDecision = "accept-once" | "accept-always" | "decline";

export interface ConsentRequest {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
  /** Static danger finding: card shows a banner and hides accept-always. */
  danger?: DangerCheckResult | null;
}

export type ConsentRequestFn = (req: ConsentRequest) => Promise<ConsentDecision>;

interface PendingEntry {
  sessionId: string;
  resolve: (d: ConsentDecision) => void;
}

const pending = new Map<string, PendingEntry>();

/**
 * Backstop for parked consent waits: even with no abort signal and no
 * session-scoped clear, a consent card must never park a turn forever.
 * Matches the longest human-wait deadline (integration/env/checkpoint: 30min).
 */
export const CONSENT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;

export function waitForConsent(
  requestId: string,
  sessionId: string,
  signal?: AbortSignal,
  timeoutMs: number = CONSENT_WAIT_TIMEOUT_MS,
): Promise<ConsentDecision> {
  return new Promise((resolve) => {
    // Already cancelled — decline immediately so the turn fails fast.
    if (signal?.aborted) {
      resolve("decline");
      return;
    }
    let onAbort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (decision: ConsentDecision) => {
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      if (timer !== undefined) clearTimeout(timer);
      pending.delete(requestId);
      resolve(decision);
    };
    onAbort = () => done("decline");
    pending.set(requestId, { sessionId, resolve: done });
    signal?.addEventListener("abort", onAbort, { once: true });
    // Deadline never extends the process lifetime (unref) and never wins
    // over an answer or abort that lands first (done is idempotent via
    // pending.delete + resolve-once semantics of the Promise executor).
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => done("decline"), Math.floor(timeoutMs));
      (timer as unknown as { unref?: () => void }).unref?.();
    }
  });
}

export function resolveConsent(requestId: string, decision: ConsentDecision): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  entry.resolve(decision);
  return true;
}

/** Whether this consent request is still awaiting an answer. */
export function hasPendingConsent(requestId: string): boolean {
  return pending.has(requestId);
}

/**
 * Reject all pending consent requests for a session (turn cancelled).
 * Resolves as decline so tool execution fails gracefully — donor behavior.
 * Returns the cleared requestIds so callers can withdraw the cards.
 */
export function clearPendingConsentsForSession(sessionId: string): string[] {
  const ids: string[] = [];
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId);
      entry.resolve("decline");
      ids.push(requestId);
    }
  }
  return ids;
}

/** Session that owns a parked consent (for withdrawal tombstones on answer). */
export function sessionForConsentRequest(requestId: string): string | null {
  return pending.get(requestId)?.sessionId ?? null;
}

export function getAgentToolConsent(
  toolName: string,
  store: ConsentStore = new MemoryConsentStore(),
): ToolConsent {
  return store.get(toolName) ?? getDefaultConsent(toolName);
}

export function setAgentToolConsent(
  toolName: string,
  consent: ToolConsent,
  store: ConsentStore,
): void {
  store.set(toolName, consent);
}

export function getAllAgentToolConsents(
  store: ConsentStore = new MemoryConsentStore(),
): Record<string, ToolConsent> {
  const result: Record<string, ToolConsent> = {};
  for (const tool of TOOL_CATALOG) {
    result[tool.name] = store.get(tool.name) ?? tool.defaultConsent;
  }
  return result;
}

/**
 * Non-schema, non-deleting SQL runs without a prompt when the
 * autoApproveNonSchemaSql setting is on. Schema-mutating or data-deleting
 * SQL always requires consent — donor rule, kept verbatim.
 */
export function shouldAutoApproveAgentTool(params: {
  toolName: string;
  metadata?: SqlConsentMetadata | null;
  autoApproveNonSchemaSql: boolean | undefined;
}): boolean {
  return (
    params.toolName === "execute_sql" &&
    params.metadata?.sqlMutatesSchema === false &&
    params.metadata?.sqlDeletesData === false &&
    params.autoApproveNonSchemaSql === true
  );
}

export class ToolNeverAllowedError extends Error {
  constructor(toolName: string) {
    super(`Should not ask for consent for a tool marked as 'never': ${toolName}`);
    this.name = "ToolNeverAllowedError";
  }
}

/**
 * Full consent check for one tool call. Returns true when the call may run.
 * `requestConsent` is invoked only when a human decision is actually needed.
 */
export async function requireAgentToolConsent(params: {
  sessionId: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
  metadata?: SqlConsentMetadata | null;
  autoApproveNonSchemaSql?: boolean;
  store?: ConsentStore;
  requestConsent: ConsentRequestFn;
  /** Full-access turn: auto-allow everything except explicit user bans. */
  bypassConsent?: boolean;
  /** Raw tool args for static danger checks (SQL/package/script scans). */
  toolArgs?: unknown;
  /** Turn abort — settles a parked wait as declined instead of hanging. */
  signal?: AbortSignal;
}): Promise<boolean> {
  const store = params.store ?? new MemoryConsentStore();
  const current = getAgentToolConsent(params.toolName, store);

  if (current === "always") return true;
  if (current === "never") throw new ToolNeverAllowedError(params.toolName);
  // Static danger scan (fast, regex-only): malformed package names are
  // command injection — blocked outright, even in full access. Other
  // findings force an ask-with-banner card (no bypass, no accept-always).
  const danger = checkToolDanger(params.toolName, params.toolArgs);
  if (danger && danger.category === "malicious_package") {
    throw new Error(`Refusing to run ${params.toolName}: ${danger.message}`);
  }
  // Full access bypasses interactive approval — but never resurrects
  // user-banned tools (checked above), and never skips danger cards.
  if (params.bypassConsent && !danger) return true;

  if (
    shouldAutoApproveAgentTool({
      toolName: params.toolName,
      metadata: params.metadata,
      autoApproveNonSchemaSql: params.autoApproveNonSchemaSql,
    })
  ) {
    return true;
  }

  const requestId = `agent:${params.toolName}:${randomUUID().slice(0, 8)}`;
  // Already cancelled — fail fast without emitting a prompt nobody can answer.
  if (params.signal?.aborted) return false;
  // Two integration styles are supported: the WS layer either answers by
  // calling resolveConsent(requestId, decision) when the user clicks, or by
  // returning the decision directly. Either path settles the wait below.
  // The request is fire-and-forget: only the decision is awaited, so a
  // cancelled session (clearPendingConsentsForSession) always settles even
  // if the transport never answers.
  const decisionPromise = waitForConsent(requestId, params.sessionId, params.signal);
  void Promise.resolve()
    .then(() =>
      params.requestConsent({
        requestId,
        sessionId: params.sessionId,
        toolName: params.toolName,
        toolDescription: params.toolDescription,
        inputPreview: params.inputPreview,
        ...(danger ? { danger } : {}),
      }),
    )
    .then(
      (direct) => {
        if (pending.has(requestId)) resolveConsent(requestId, direct);
      },
      () => {
        if (pending.has(requestId)) resolveConsent(requestId, "decline");
      },
    );
  const response = await decisionPromise;

  if (response === "accept-always") {
    setAgentToolConsent(params.toolName, "always", store);
    return true;
  }
  return response === "accept-once";
}

export interface ToolSetOptions {
  readOnly?: boolean;
  planModeOnly?: boolean;
  /** Compat no-op: no tools are subscription-gated. */
  basicAgentMode?: boolean;
  enableAppBlueprint?: boolean;
  includeDeferredTools?: boolean;
  requestDeferredTools?: string[];
  /** Legacy XML-tag build path uses the tight build profile. */
  buildProfile?: boolean;
  toolAvailable?: (toolName: string) => boolean;
}

export interface InclusionContext {
  modifiesState?: (toolName: string) => boolean;
  /**
   * Context/state gates (donor isEnabled parity). Every gate is tri-state:
   * explicit false/true enforces, undefined preserves legacy behavior (tool
   * stays). Callers that know the turn state (turnContext) pass explicit
   * values; tests and partial callers pass nothing and see no change.
   */
  /** DB link present (session link counts) — gates execute_sql + DB tools. */
  hasDbLink?: boolean;
  /**
   * Managed project connection (donor ID semantics): supabase projectId, or
   * neon projectId + active branch. Gates add_integration — a bare-URL link
   * is not managed, so integration stays offered to allow upgrading.
   */
  hasManagedDbLink?: boolean;
  /** Linked DB provider — gates per-provider info tools. */
  dbProvider?: string | null;
  /** Sandbox script execution allowed (setting; default true until 018). */
  sandboxEnabled?: boolean;
  /** MCP tool search available (registry present + sandbox). */
  mcpSearchEnabled?: boolean;
  /** Code-explorer backend ready (016 wires readiness). */
  codeExplorerEnabled?: boolean;
}

/** Tools requiring any linked database. */
const DB_LINK_TOOLS = new Set(["execute_sql", "get_database_table_schema"]);

/**
 * Whether a tool is offered given turn context/state (donor isEnabled).
 * Tri-state: only explicit false (or a mismatched provider) excludes.
 */
export function isToolEnabled(toolName: string, ctx: InclusionContext = {}): boolean {
  if (DB_LINK_TOOLS.has(toolName) && ctx.hasDbLink === false) return false;
  if (toolName === "get_supabase_project_info") {
    if (ctx.hasDbLink === false) return false;
    if (ctx.dbProvider != null && ctx.dbProvider !== "supabase") return false;
  }
  if (toolName === "get_neon_project_info") {
    if (ctx.hasDbLink === false) return false;
    if (ctx.dbProvider != null && ctx.dbProvider !== "neon") return false;
  }
  // Donor: add_integration offered only while NO managed database is
  // connected (V1 keys off project IDs, not the link itself).
  if (toolName === "add_integration" && ctx.hasManagedDbLink === true) return false;
  if (toolName === "execute_sandbox_script" && ctx.sandboxEnabled === false) return false;
  if (
    (toolName === "search_mcp_tools" || toolName === "get_mcp_tool_schema") &&
    ctx.mcpSearchEnabled === false
  ) {
    return false;
  }
  if (
    (toolName === "explore_code" || toolName === "lsp_symbol_lookup") &&
    ctx.codeExplorerEnabled === false
  ) {
    return false;
  }
  return true;
}

/**
 * Whether a tool belongs in this turn's tool set — single source of truth
 * (donor shouldIncludeTool semantics, Pro/engine gates removed).
 */
export function shouldIncludeTool(
  toolName: string,
  ctx: InclusionContext = {},
  options: ToolSetOptions = {},
  store: ConsentStore = new MemoryConsentStore(),
): boolean {
  const meta = getToolMeta(toolName);
  if (!meta) return false;
  if (getAgentToolConsent(toolName, store) === "never") return false;

  const modifies = ctx.modifiesState?.(toolName) ?? meta.modifiesState;

  if (options.buildProfile && !BUILD_PROFILE_TOOLS.has(toolName)) return false;
  if (options.planModeOnly && modifies && !PLANNING_SPECIFIC_TOOLS.has(toolName)) {
    return false;
  }
  if (!options.planModeOnly && PLAN_MODE_ONLY_TOOLS.has(toolName)) return false;
  if (options.enableAppBlueprint === false && APP_BLUEPRINT_TOOLS.has(toolName)) {
    return false;
  }
  if (options.readOnly && modifies) return false;
  if (
    meta.deferred &&
    !options.includeDeferredTools &&
    (!options.requestDeferredTools || !options.requestDeferredTools.includes(toolName))
  ) {
    return false;
  }
  if (options.toolAvailable && !options.toolAvailable(toolName)) return false;
  if (!isToolEnabled(toolName, ctx)) return false;
  void CAPABILITY_GATED_BLUEPRINT_TOOLS;
  return true;
}

/** Names included for a turn — convenience over shouldIncludeTool. */
export function toolNamesForTurn(
  ctx: InclusionContext = {},
  options: ToolSetOptions = {},
  store: ConsentStore = new MemoryConsentStore(),
): string[] {
  return TOOL_CATALOG.map((t) => t.name).filter((n) => shouldIncludeTool(n, ctx, options, store));
}
