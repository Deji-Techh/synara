/**
 * Global build-artifact registry.
 *
 * One row per successful Flutter build (APK/AAB/IPA) snapshotted by the engine
 * into the app's stable `.caide/artifacts/` store. The registry owns
 * persistence plus the guarded on-disk delete; project attribution is resolved
 * at insert time from the projection tables so gallery rows keep a denormalized
 * project title even after the project is deleted.
 */
import { ArtifactId, ArtifactRecord, ThreadId, TrimmedNonEmptyString } from "@caide/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { PersistenceDecodeError, PersistenceSqlError } from "../Errors.ts";

export type ArtifactRegistryError = PersistenceSqlError | PersistenceDecodeError;

export const InsertArtifactInput = Schema.Struct({
  threadId: ThreadId,
  appDir: TrimmedNonEmptyString,
  filePath: TrimmedNonEmptyString,
  fileName: TrimmedNonEmptyString,
  kind: Schema.Literals(["apk", "aab", "ipa"]),
  channel: Schema.NullOr(Schema.Literals(["debug", "profile", "release"])),
  target: TrimmedNonEmptyString,
  sizeBytes: Schema.Number,
  sha256: Schema.NullOr(TrimmedNonEmptyString),
  finishedAt: TrimmedNonEmptyString,
});
export type InsertArtifactInput = typeof InsertArtifactInput.Type;

export const RenameArtifactInput = Schema.Struct({
  artifactId: ArtifactId,
  displayName: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
});
export type RenameArtifactInput = typeof RenameArtifactInput.Type;

export const DeleteArtifactInput = Schema.Struct({
  artifactId: ArtifactId,
});
export type DeleteArtifactInput = typeof DeleteArtifactInput.Type;

export interface ArtifactRegistryShape {
  /** Record a completed build; resolves project attribution best-effort. */
  readonly insert: (
    input: InsertArtifactInput,
  ) => Effect.Effect<ArtifactRecord, ArtifactRegistryError>;

  /** Newest-first listing for the global gallery. */
  readonly list: () => Effect.Effect<ReadonlyArray<ArtifactRecord>, ArtifactRegistryError>;

  /** Update the user-facing display name only (file name never changes). */
  readonly rename: (
    input: RenameArtifactInput,
  ) => Effect.Effect<ArtifactRecord, ArtifactRegistryError>;

  /**
   * Delete a row and unlink its snapshot file. The unlink is guarded: only
   * files under the owning app's `.caide/artifacts/` store are removed.
   */
  readonly delete: (
    input: DeleteArtifactInput,
  ) => Effect.Effect<{ artifactId: ArtifactId }, ArtifactRegistryError>;

  /** Fetch one artifact (share-link minting). */
  readonly get: (
    artifactId: ArtifactId,
  ) => Effect.Effect<ArtifactRecord | null, ArtifactRegistryError>;
}

export class ArtifactRegistry extends ServiceMap.Service<ArtifactRegistry, ArtifactRegistryShape>()(
  "caide/persistence/Services/ArtifactRegistry/ArtifactRegistry",
) {}
