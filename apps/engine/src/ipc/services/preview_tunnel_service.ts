// FILE: src/ipc/services/preview_tunnel_service.ts
// Purpose: Stub — public preview tunnels are stripped (Flutter-only scope).

import type { z } from "zod";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { TunnelPreviewStatusSchema } from "../types/app";

type TunnelPreviewStatus = z.infer<typeof TunnelPreviewStatusSchema>;

export async function startTunnelPreview(
  _appId: number,
): Promise<TunnelPreviewStatus> {
  throw new CaideError(
    "Preview tunnels are not available in the Flutter Builder engine.",
    CaideErrorKind.Precondition,
  );
}

export async function stopTunnelPreview(_appId: number): Promise<void> {
  // no-op
}

export async function getTunnelPreviewStatus(
  _appId: number,
): Promise<TunnelPreviewStatus | null> {
  return null;
}