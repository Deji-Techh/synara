// FILE: src/supabase_admin/supabase_utils.ts
// Purpose: Stub — Supabase function handling is stripped (Flutter-only scope).
// Path classifiers return false/null so the file tools never treat files as
// Supabase server functions, and deployment is a no-op.

export interface SupabaseDeployProgress {
  phase: "deploying" | "finished" | "failed";
  total: number;
  active: number;
  queued: number;
  completed: number;
  succeeded: number;
  failed: number;
  functionName?: string;
}

export interface SupabaseDeployError {
  functionName?: string;
  error?: unknown;
}

export function isServerFunction(..._args: unknown[]): boolean {
  return false;
}

export function isSharedServerModule(..._args: unknown[]): boolean {
  return false;
}

export function deployAffectedSupabaseFunctions(
  ..._args: unknown[]
): Promise<SupabaseDeployError[]> {
  return Promise.resolve([]);
}

export function extractFunctionNameFromPath(..._args: unknown[]): string | null {
  return null;
}

export function deployAllSupabaseFunctions(
  ..._args: unknown[]
): Promise<SupabaseDeployError[]> {
  return Promise.resolve([]);
}