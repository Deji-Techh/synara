// FILE: src/ipc/utils/vercel_utils.ts
// Purpose: Stub — Vercel deployment surfaces are stripped (Flutter-only scope).
// Team slug resolution degrades to null so app handlers keep valid types.

export async function getVercelTeamSlug(
  _teamId?: string | null,
): Promise<string | null> {
  return null;
}