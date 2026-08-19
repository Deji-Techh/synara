// FILE: src/supabase_admin/supabase_management_client.ts
// Purpose: Stub — Supabase management API is stripped (Flutter-only scope).

import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const NOT_AVAILABLE = "Supabase integration is not available in the Flutter Builder engine.";

export async function executeSupabaseSql(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export async function deploySupabaseFunction(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export async function deleteSupabaseFunction(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export async function getSupabaseProjectName(..._args: unknown[]): Promise<null> {
  return null;
}