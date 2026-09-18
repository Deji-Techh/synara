// FILE: ports.ts
// Purpose: Preview proxy port allocation (donor shared/ports.ts parity).
// The proxy band (42100..52099) stays clear of dev-server ports; the
// fallback band sits just above so a fallback never collides with another
// session's reserved slot. Per-thread deterministic preferred ports keep
// the preview origin stable across restarts (origin-scoped browser state).

export const PROXY_PORT_BASE = 42100;
export const PROXY_PORT_RANGE = 10_000;
export const PROXY_FALLBACK_PORT_START = PROXY_PORT_BASE + PROXY_PORT_RANGE;
export const PROXY_FALLBACK_MAX_ATTEMPTS = 50;

function hashThread(threadId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < threadId.length; i++) {
    hash ^= threadId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic preferred proxy port for a thread (donor getAppProxyPort
 * parity, keyed by threadId instead of numeric appId).
 */
export function getThreadProxyPort(threadId: string): number {
  return PROXY_PORT_BASE + (hashThread(threadId) % PROXY_PORT_RANGE);
}
