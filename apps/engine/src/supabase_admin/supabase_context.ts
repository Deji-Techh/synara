// FILE: src/supabase_admin/supabase_context.ts
// Purpose: Stub — Supabase integration is stripped (Flutter-only scope).
// Degrades gracefully: prompt/context builders return empty values, schema
// introspectors return null.

export async function getSupabaseContext(..._args: unknown[]): Promise<string> {
  return "";
}

export async function getSupabaseClientCode(..._args: unknown[]): Promise<string> {
  return "";
}

export async function getSupabaseTableSchema(..._args: unknown[]): Promise<null> {
  return null;
}

export async function getSupabaseProjectInfo(..._args: unknown[]): Promise<null> {
  return null;
}