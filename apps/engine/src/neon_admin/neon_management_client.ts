// FILE: src/neon_admin/neon_management_client.ts
// Purpose: Stub — Neon management API access is stripped (Flutter-only scope).

import { CaideError, CaideErrorKind } from "@/errors/caide_error";

export async function getNeonClient(..._args: unknown[]): Promise<any> {
  const unsupported = () => {
    throw new CaideError(
      "Neon management API is not available in the Flutter Builder engine.",
      CaideErrorKind.Precondition,
    );
  };
  return new Proxy(
    {},
    {
      get: () => async () => ({ data: {} as any }),
    },
  );
}
