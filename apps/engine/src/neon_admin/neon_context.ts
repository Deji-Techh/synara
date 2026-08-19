// FILE: src/neon_admin/neon_context.ts
// Purpose: Flutter-only scope — Neon database integration is stripped from the
// engine. These stubs keep the agent core compiling and degrade the removed
// features gracefully at runtime (SQL tools report the integration as
// unavailable instead of crashing).

import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const NOT_AVAILABLE = "Neon database integration is not available in the Flutter Builder engine.";

export async function executeNeonSql(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export async function executeNeonStatementsInTransaction(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export async function getConnectionUri(..._args: unknown[]): Promise<never> {
  throw new CaideError(NOT_AVAILABLE, CaideErrorKind.Precondition);
}

export function getNeonClientCode(..._args: unknown[]): string {
  return "";
}

export async function getNeonProjectInfo(..._args: unknown[]): Promise<null> {
  return null;
}

export async function getNeonTableSchema(..._args: unknown[]): Promise<null> {
  return null;
}