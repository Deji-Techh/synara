// FILE: mcpConsent.ts
// Purpose: Per-tool MCP consent (ask/always/denied) + renderer round-trip.
// Donor: dyad x caide src/ipc/utils/mcp_consent.ts (behavior port):
// drizzle table → injected McpConsentStore (M4 persists to SQLite);
// Electron sender → injected request callback (WS layer, M3); sessionId
// replaces chatId:number. The auto-approve CLASSIFIER prompt lives in
// mcpConsentPolicy.ts; the always-ask item list is enforced by the policy.

export type McpConsent = "ask" | "always" | "denied";
export type McpConsentDecision = "accept-once" | "accept-always" | "decline";

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

let counter = 0;
const pending = new Map<string, PendingEntry>();

export function waitForMcpConsent(requestId: string, sessionId: string): Promise<McpConsentDecision> {
  return new Promise((resolve) => {
    pending.set(requestId, { sessionId, resolve });
  });
}

export function resolveMcpConsent(requestId: string, decision: McpConsentDecision): void {
  const entry = pending.get(requestId);
  if (entry) {
    pending.delete(requestId);
    entry.resolve(decision);
  }
}

// Resolve pending MCP consents for a session as declined (turn cancelled).
export function clearPendingMcpConsentsForSession(sessionId: string): void {
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId);
      entry.resolve("decline");
    }
  }
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
  inputPreview?: string | null;
  autoApproved?: { approved: boolean; reason?: string };
  store?: ConsentStore;
  requestConsent: McpConsentRequestFn;
}): Promise<{ allowed: boolean; autoApproveReason?: string }> {
  const store = params.store ?? new MemoryMcpConsentStore();
  const stored = getMcpConsent(params.serverId, params.toolName, store);
  if (stored === "always") return { allowed: true };
  if (stored === "denied") return { allowed: false };
  if (params.autoApproved?.approved) {
    return { allowed: true, autoApproveReason: params.autoApproved.reason };
  }

  const requestId = `mcp:${params.serverName}:${params.toolName}:${++counter}`;
  const decisionPromise = waitForMcpConsent(requestId, params.sessionId);
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
