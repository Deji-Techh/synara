import { createTypedHandler } from "./base";
import { freeAgentQuotaContracts } from "../types/free_agent_quota";
import { FREE_AGENT_QUOTA_LIMIT } from "@/lib/free_agent_quota_limit";

/**
 * CAIDE has no subscription or quota tier (P4: completely free). The IPC
 * contract is retained for compatibility, but the quota always reports an
 * unlimited status and marking/unmarking are no-ops.
 */
export { FREE_AGENT_QUOTA_LIMIT };

export function registerFreeAgentQuotaHandlers() {
  createTypedHandler(freeAgentQuotaContracts.getFreeAgentQuotaStatus, async () => {
    return getFreeAgentQuotaStatus();
  });
}

/**
 * Retained for call-site compatibility. No-op — CAIDE no longer limits
 * Agent mode by a message quota.
 */
export async function markMessageAsUsingFreeAgentQuota(_messageId: number): Promise<void> {
  // No-op.
}

/**
 * Retained for call-site compatibility. No-op.
 */
export async function unmarkMessageAsUsingFreeAgentQuota(_messageId: number): Promise<void> {
  // No-op.
}

/**
 * Gets the current free agent quota status. Always unlimited.
 */
export async function getFreeAgentQuotaStatus() {
  return {
    messagesUsed: 0,
    messagesLimit: FREE_AGENT_QUOTA_LIMIT,
    isQuotaExceeded: false,
    windowStartTime: null,
    resetTime: null,
    hoursUntilReset: null,
  };
}
