// FILE: thresholds.ts
// Purpose: Compaction threshold math (donor-verbatim).
// Donor: dyad x caide src/ipc/utils/token_utils.ts getCompactionThreshold +
// shouldTriggerCompaction. Large windows compact at 85%-of-window (not a
// fixed 250k); small windows reserve 25k headroom under a provider cap
// (google 190k, else 250k). There is deliberately NO openai-specific cap —
// V1 has none. NaN/non-positive windows fall back to 100k (V2 guard kept).

export function isGoogleProvider(providerId?: string): boolean {
  const provider = (providerId ?? "").toLowerCase();
  return provider.includes("google") || provider.includes("gemini");
}

/**
 * Donor getCompactionThreshold verbatim: context window + provider in,
 * trigger threshold out.
 */
export function getCompactionThreshold(contextWindow: number, providerId?: string): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return 100_000;
  if (contextWindow > 250_000) {
    return Math.max(200_000, Math.min(Math.floor(contextWindow * 0.85), contextWindow - 40_000));
  }
  const cap = isGoogleProvider(providerId) ? 190_000 : 250_000;
  return Math.min(cap, Math.max(0, contextWindow - 25_000));
}

/** Donor shouldTriggerCompaction verbatim: fire at or past the threshold. */
export function shouldTriggerCompaction(totalTokens: number, threshold: number): boolean {
  return totalTokens >= threshold;
}
