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
}

export type ConsentRequestFn = (req: ConsentRequest) => Promise<ConsentDecision>;

interface PendingEntry {
  sessionId: string;
  resolve: (d: ConsentDecision) => void;
}

let requestCounter = 0;
const pending = new Map<string, PendingEntry>();

export function waitForConsent(requestId: string, sessionId: string): Promise<ConsentDecision> {
  return new Promise((resolve) => {
    pending.set(requestId, { sessionId, resolve });
  });
}

export function resolveConsent(requestId: string, decision: ConsentDecision): void {
  const entry = pending.get(requestId);
  if (entry) {
    pending.delete(requestId);
    entry.resolve(decision);
  }
}

/**
 * Reject all pending consent requests for a session (turn cancelled).
 * Resolves as decline so tool execution fails gracefully — donor behavior.
 */
export function clearPendingConsentsForSession(sessionId: string): void {
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId);
      entry.resolve("decline");
    }
  }
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
}): Promise<boolean> {
  const store = params.store ?? new MemoryConsentStore();
  const current = getAgentToolConsent(params.toolName, store);

  if (current === "always") return true;
  if (current === "never") throw new ToolNeverAllowedError(params.toolName);

  if (
    shouldAutoApproveAgentTool({
      toolName: params.toolName,
      metadata: params.metadata,
      autoApproveNonSchemaSql: params.autoApproveNonSchemaSql,
    })
  ) {
    return true;
  }

  const requestId = `agent:${params.toolName}:${++requestCounter}`;
  // Two integration styles are supported: the WS layer either answers by
  // calling resolveConsent(requestId, decision) when the user clicks, or by
  // returning the decision directly. Either path settles the wait below.
  // The request is fire-and-forget: only the decision is awaited, so a
  // cancelled session (clearPendingConsentsForSession) always settles even
  // if the transport never answers.
  const decisionPromise = waitForConsent(requestId, params.sessionId);
  void Promise.resolve()
    .then(() =>
      params.requestConsent({
        requestId,
        sessionId: params.sessionId,
        toolName: params.toolName,
        toolDescription: params.toolDescription,
        inputPreview: params.inputPreview,
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

  const modifies =
    ctx.modifiesState?.(toolName) ?? meta.modifiesState;

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
  void CAPABILITY_GATED_BLUEPRINT_TOOLS;
  return true;
}

/** Names included for a turn — convenience over shouldIncludeTool. */
export function toolNamesForTurn(
  ctx: InclusionContext = {},
  options: ToolSetOptions = {},
  store: ConsentStore = new MemoryConsentStore(),
): string[] {
  return TOOL_CATALOG.map((t) => t.name).filter((n) =>
    shouldIncludeTool(n, ctx, options, store),
  );
}
