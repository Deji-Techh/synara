import { createTypedHandler } from "./base";
import { freeModelQuotaContracts } from "../types/free_model_quota";

/**
 * CAIDE has no subscription or quota tier (P4: completely free). The IPC
 * contract is retained for compatibility, but the free-model quota always
 * reports an unlimited status (no network call, no key requirement).
 */
export function registerFreeModelQuotaHandlers() {
  createTypedHandler(freeModelQuotaContracts.getFreeModelQuotaStatus, async () =>
    getFreeModelQuotaStatus(),
  );
}

export async function getFreeModelQuotaStatus() {
  return {
    messagesUsed: 0,
    messagesLimit: Number.MAX_SAFE_INTEGER,
    messagesRemaining: Number.MAX_SAFE_INTEGER,
    isQuotaExceeded: false,
    resetTime: null,
  };
}
