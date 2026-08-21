import { Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";

// FILE: artifacts.ts
// Purpose: Contracts for the global build-artifact gallery — every successful
// Flutter build (APK/AAB/IPA) is snapshotted by the engine into a stable
// per-app store and registered server-side so it can be listed, renamed,
// shared, downloaded, and deleted from the Caide-menu Artifacts dialog.
// Layer: Contracts (schema-only)

export const ARTIFACTS_WS_METHODS = {
  list: "artifacts.list",
  rename: "artifacts.rename",
  delete: "artifacts.delete",
  shareUrl: "artifacts.shareUrl",
} as const;

const ARTIFACT_ID_MAX_LENGTH = 64;
const ARTIFACT_DISPLAY_NAME_MAX_LENGTH = 200;
/** Hard cap on a single listing; the dialog filters/sorts client-side. */
export const ARTIFACTS_LIST_MAX_COUNT = 500;

export const ArtifactId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(ARTIFACT_ID_MAX_LENGTH),
);
export type ArtifactId = typeof ArtifactId.Type;

export const ArtifactKind = Schema.Literals(["apk", "aab", "ipa"]);
export type ArtifactKind = typeof ArtifactKind.Type;

export const ArtifactChannel = Schema.Literals(["debug", "profile", "release"]);
export type ArtifactChannel = typeof ArtifactChannel.Type;

export const ArtifactDisplayName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(ARTIFACT_DISPLAY_NAME_MAX_LENGTH),
);
export type ArtifactDisplayName = typeof ArtifactDisplayName.Type;

export const ArtifactRecord = Schema.Struct({
  id: ArtifactId,
  /** Owning project, when it can still be resolved. */
  projectId: Schema.NullOr(ProjectId),
  /** Denormalized project title for display when the project row is gone. */
  projectName: Schema.NullOr(TrimmedNonEmptyString),
  threadId: ThreadId,
  displayName: ArtifactDisplayName,
  fileName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  kind: ArtifactKind,
  channel: Schema.NullOr(ArtifactChannel),
  target: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  sizeBytes: NonNegativeInt,
  sha256: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
});
export type ArtifactRecord = typeof ArtifactRecord.Type;

export const ArtifactsListInput = Schema.Struct({});
export type ArtifactsListInput = typeof ArtifactsListInput.Type;

export const ArtifactsListResult = Schema.Struct({
  artifacts: Schema.Array(ArtifactRecord).check(Schema.isMaxLength(ARTIFACTS_LIST_MAX_COUNT)),
});
export type ArtifactsListResult = typeof ArtifactsListResult.Type;

export const ArtifactsRenameInput = Schema.Struct({
  artifactId: ArtifactId,
  displayName: ArtifactDisplayName,
});
export type ArtifactsRenameInput = typeof ArtifactsRenameInput.Type;

export const ArtifactsRenameResult = Schema.Struct({
  artifact: ArtifactRecord,
});
export type ArtifactsRenameResult = typeof ArtifactsRenameResult.Type;

export const ArtifactsDeleteInput = Schema.Struct({
  artifactId: ArtifactId,
});
export type ArtifactsDeleteInput = typeof ArtifactsDeleteInput.Type;

export const ArtifactsDeleteResult = Schema.Struct({
  artifactId: ArtifactId,
});
export type ArtifactsDeleteResult = typeof ArtifactsDeleteResult.Type;

export const ArtifactsShareUrlInput = Schema.Struct({
  artifactId: ArtifactId,
});
export type ArtifactsShareUrlInput = typeof ArtifactsShareUrlInput.Type;

export const ArtifactsShareUrlResult = Schema.Struct({
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(2048)),
});
export type ArtifactsShareUrlResult = typeof ArtifactsShareUrlResult.Type;
