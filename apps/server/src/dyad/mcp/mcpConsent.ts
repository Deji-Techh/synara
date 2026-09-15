// FILE: mcpConsent.ts
// Purpose: Per-tool MCP consent (ask/always/denied) + renderer round-trip.
// Donor: dyad x caide src/ipc/utils/mcp_consent.ts (behavior port):
// drizzle table → injected McpConsentStore (M4 persists to SQLite);
// Electron sender → injected request callback (WS layer, M3); sessionId
// replaces chatId:number. The auto-approve CLASSIFIER prompt lives in
// mcpConsentPolicy.ts; the always-ask item list is enforced by the policy.

export type McpConsent = "ask" | "always" | "denied";
export type McpConsentDecision = "accept-once" | "accept-always" | "decline";
import { randomUUID } from "node:crypto";

export interface McpConsentStore {
  get(serverId: number | string, toolName: string): McpConsent | undefined;
  set(serverId: number | string, toolName: string, consent: McpConsent): void;
}

export class MemoryMcpConsentStore implements McpConsentStore {
  private map = new Map<string, McpConsent>();
  private key(serverId: number | string, toolName: string): string {
    return `${serverId}::${toolName}`;
  }
  get(serverId: number | string, toolName: string): McpConsent | undefined {
    return this.map.get(this.key(serverId, toolName));
  }
  set(serverId: number | string, toolName: string, consent: McpConsent): void {
    this.map.set(this.key(serverId, toolName), consent);
  }
}

export interface McpConsentRequest {
  requestId: string;
  sessionId: string;
  serverName: string;
  toolName: string;
  inputPreview?: string | null;
  autoApproveReason?: string | null;
}

export type McpConsentRequestFn = (req: McpConsentRequest) => Promise<McpConsentDecision>;

interface PendingEntry {
  sessionId: string;
  resolve: (d: McpConsentDecision) => void;
}

const pending = new Map<string, PendingEntry>();

/**
 * Backstop for parked MCP consent waits — same 30min deadline as tool
 * consent (see permissions.ts CONSENT_WAIT_TIMEOUT_MS): a parked card must
 * never wedge a turn forever when abort and session-clear both miss.
 */
export const MCP_CONSENT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;

export function waitForMcpConsent(
  requestId: string,
  sessionId: string,
  signal?: AbortSignal,
  timeoutMs: number = MCP_CONSENT_WAIT_TIMEOUT_MS,
): Promise<McpConsentDecision> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("decline");
      return;
    }
    let onAbort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (decision: McpConsentDecision) => {
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      if (timer !== undefined) clearTimeout(timer);
      pending.delete(requestId);
      resolve(decision);
    };
    onAbort = () => done("decline");
    pending.set(requestId, { sessionId, resolve: done });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => done("decline"), Math.floor(timeoutMs));
      (timer as unknown as { unref?: () => void }).unref?.();
    }
  });
}

export function resolveMcpConsent(requestId: string, decision: McpConsentDecision): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  entry.resolve(decision);
  return true;
}

/** Whether this MCP consent request is still awaiting an answer. */
export function hasPendingMcpConsent(requestId: string): boolean {
  return pending.has(requestId);
}

// Resolve pending MCP consents for a session as declined (turn cancelled).
// Returns the cleared requestIds so callers can withdraw the cards.
export function clearPendingMcpConsentsForSession(sessionId: string): string[] {
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

/** Session that owns a parked MCP consent (for withdrawal tombstones on answer). */
export function sessionForMcpConsentRequest(requestId: string): string | null {
  return pending.get(requestId)?.sessionId ?? null;
}

export function getMcpConsent(
  serverId: number | string,
  toolName: string,
  store: McpConsentStore = new MemoryMcpConsentStore(),
): McpConsent {
  return store.get(serverId, toolName) ?? "ask";
}

/**
 * Full consent check for one MCP tool call. Pure-allow paths (stored
 * "always", classifier-approved with reason) skip the UI; everything else
 * parks on the renderer round-trip.
 */
export async function requireMcpToolConsent(params: {
  sessionId: string;
  serverId: number | string;
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
  autoApproved?: { approved: boolean; reason?: string };
  /** Session auto-approve-safe toggle: run the cheap classifier race. */
  autoApproveSafe?: boolean;
  /** Raw args for the classifier (preview is truncated for display). */
  toolArgs?: unknown;
  store?: ConsentStore;
  requestConsent: McpConsentRequestFn;
  /** Turn abort — settles a parked wait as declined instead of hanging. */
  signal?: AbortSignal;
}): Promise<{ allowed: boolean; autoApproveReason?: string }> {
  const store = params.store ?? new MemoryMcpConsentStore();
  const stored = getMcpConsent(params.serverId, params.toolName, store);
  if (stored === "always") return { allowed: true };
  if (stored === "denied") return { allowed: false };
  if (params.autoApproved?.approved) {
    return { allowed: true, autoApproveReason: params.autoApproved.reason };
  }

  const requestId = `mcp:${params.serverName}:${params.toolName}:${randomUUID().slice(0, 8)}`;
  if (params.signal?.aborted) return { allowed: false };
  // Classifier race (donor parity): safe calls auto-approve with a shown
  // reason; the human always wins ties (resolveXxx only settles pending
  // waiters, so whichever answer lands first wins and the other no-ops).
  // Fail-closed: classifier errors/timeouts resolve nothing — the card asks.
  if (params.autoApproveSafe !== false) {
    void (async () => {
      try {
        const { buildMcpAutoApprove } = await import("./mcpAutoConsent.ts");
        const classify = buildMcpAutoApprove({
          sessionId: params.sessionId,
          serverName: params.serverName,
          toolName: params.toolName,
          toolDescription: params.toolDescription ?? null,
          args: params.toolArgs ?? params.inputPreview,
        });
        const verdict = await classify?.();
        if (verdict?.approved && pending.has(requestId)) {
          resolveMcpConsent(requestId, "accept-once");
        }
      } catch {
        // fail closed — card asks
      }
    })();
  }
  const decisionPromise = waitForMcpConsent(requestId, params.sessionId, params.signal);
  void Promise.resolve()
    .then(() =>
      params.requestConsent({
        requestId,
        sessionId: params.sessionId,
        serverName: params.serverName,
        toolName: params.toolName,
        inputPreview: params.inputPreview,
      }),
    )
    .then(
      (direct) => {
        if (pending.has(requestId)) resolveMcpConsent(requestId, direct);
      },
      () => {
        if (pending.has(requestId)) resolveMcpConsent(requestId, "decline");
      },
    );
  const decision = await decisionPromise;
  if (decision === "accept-always") {
    store.set(params.serverId, params.toolName, "always");
    return { allowed: true };
  }
  return { allowed: decision === "accept-once" };
}
