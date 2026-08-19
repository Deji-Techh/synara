// FILE: src/ipc/services/multi_tenant_public_preview_service.ts
// Purpose: Stub — public previews of web apps are stripped (Flutter-only).
// Signatures follow appContracts so the typed handlers stay valid; creation
// throws a classified error, status getters return null.

import type { z } from "zod";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { PublicPreviewStatusSchema, StartPublicPreviewParamsSchema } from "../types/app";

type PublicPreviewStatus = z.infer<typeof PublicPreviewStatusSchema>;

export async function startPublicPreview(
  _params: z.infer<typeof StartPublicPreviewParamsSchema>,
): Promise<PublicPreviewStatus> {
  throw new CaideError(
    "Public previews are not available in the Flutter Builder engine.",
    CaideErrorKind.Precondition,
  );
}

export async function stopPublicPreview(_appId: number): Promise<void> {
  // no-op
}

export async function getPublicPreviewStatus(
  _appId: number,
): Promise<PublicPreviewStatus | null> {
  return null;
}

export async function refreshPublicPreview(
  _appId: number,
): Promise<PublicPreviewStatus> {
  throw new CaideError(
    "Public previews are not available in the Flutter Builder engine.",
    CaideErrorKind.Precondition,
  );
}