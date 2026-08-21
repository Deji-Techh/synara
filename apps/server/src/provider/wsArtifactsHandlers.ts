/**
 * WebSocket handlers for the artifacts RPC group.
 *
 * The global build-artifact gallery is pure server-side CRUD over the
 * artifacts registry (no engine session involved): list every snapshotted
 * build, rename its display name, delete row + guarded snapshot file, and
 * mint a long-TTL local-preview grant for shareable download links.
 *
 * @module provider/wsArtifactsHandlers
 */
import {
  ARTIFACTS_WS_METHODS,
  type ArtifactsDeleteInput,
  type ArtifactsDeleteResult,
  type ArtifactsListInput,
  type ArtifactsListResult,
  type ArtifactsRenameInput,
  type ArtifactsRenameResult,
  type ArtifactsShareUrlInput,
  type ArtifactsShareUrlResult,
  WsRpcError,
} from "@caide/contracts";
import { Effect } from "effect";

import { createLocalPreviewGrant } from "../localImageFiles";
import type { ArtifactRegistryShape } from "../persistence/Services/ArtifactRegistry.ts";

/** Share links outlive preview grants by design: 24h instead of 2 minutes. */
const ARTIFACT_SHARE_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

export interface WsArtifactsHandlers {
  readonly [ARTIFACTS_WS_METHODS.list]: (
    input: ArtifactsListInput,
  ) => Effect.Effect<ArtifactsListResult, WsRpcError>;
  readonly [ARTIFACTS_WS_METHODS.rename]: (
    input: ArtifactsRenameInput,
  ) => Effect.Effect<ArtifactsRenameResult, WsRpcError>;
  readonly [ARTIFACTS_WS_METHODS.delete]: (
    input: ArtifactsDeleteInput,
  ) => Effect.Effect<ArtifactsDeleteResult, WsRpcError>;
  readonly [ARTIFACTS_WS_METHODS.shareUrl]: (
    input: ArtifactsShareUrlInput,
  ) => Effect.Effect<ArtifactsShareUrlResult, WsRpcError>;
}

export function makeWsArtifactsHandlers(
  artifactRegistry: ArtifactRegistryShape,
): WsArtifactsHandlers {
  const mapError = (cause: unknown, fallback: string): WsRpcError =>
    new WsRpcError({
      message: cause instanceof Error && cause.message.length > 0 ? cause.message : fallback,
      cause,
    });

  return {
    [ARTIFACTS_WS_METHODS.list]: () =>
      artifactRegistry.list().pipe(
        Effect.map((artifacts) => ({ artifacts: [...artifacts] })),
        Effect.mapError((cause) => mapError(cause, "Failed to list artifacts")),
      ),
    [ARTIFACTS_WS_METHODS.rename]: (input) =>
      artifactRegistry.rename(input).pipe(
        Effect.map((artifact) => ({ artifact })),
        Effect.mapError((cause) => mapError(cause, "Failed to rename artifact")),
      ),
    [ARTIFACTS_WS_METHODS.delete]: (input) =>
      artifactRegistry
        .delete(input)
        .pipe(Effect.mapError((cause) => mapError(cause, "Failed to delete artifact"))),
    [ARTIFACTS_WS_METHODS.shareUrl]: (input) =>
      artifactRegistry.get(input.artifactId).pipe(
        Effect.flatMap((artifact) => {
          if (artifact === null) {
            return Effect.fail(new WsRpcError({ message: "Artifact not found." }));
          }
          return Effect.tryPromise({
            try: () =>
              createLocalPreviewGrant({
                requestedPath: artifact.filePath,
                ttlMs: ARTIFACT_SHARE_GRANT_TTL_MS,
              }),
            catch: (cause) => mapError(cause, "Failed to create artifact share link"),
          }).pipe(Effect.map((grantResult) => ({ artifact, grantResult })));
        }),
        Effect.map(({ artifact, grantResult }) => ({
          filePath: artifact.filePath,
          grant: grantResult.grant,
          expiresAt: grantResult.expiresAt,
        })),
        Effect.mapError((cause) =>
          cause instanceof WsRpcError ? cause : mapError(cause, "Failed to create share link"),
        ),
      ),
  };
}
