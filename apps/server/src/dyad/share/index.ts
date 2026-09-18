// FILE: index.ts
// Purpose: Time-boxed share grants (item 38, first slice): store, agent
// tools, and the public download route.

export {
  mintShareGrant,
  resolveShareGrant,
  revokeShareGrant,
  listShareGrants,
  resetShareStores,
  defaultSharesPath,
  SHARE_TTL_MIN_DAYS,
  SHARE_TTL_MAX_DAYS,
  SHARE_TTL_DEFAULT_DAYS,
  type ShareGrant,
} from "./shareStore.ts";
export {
  shareArtifactTool,
  revokeShareTool,
  listSharesTool,
  resolveShareBase,
  ALL_SHARE_TOOLS,
} from "./shareTools.ts";
export { shareRouteLayer, shareDownloadRouteLayer } from "./shareRoute.ts";
export {
  CAIDE_PACKAGE_EXTENSION,
  CAIDE_PACKAGE_FORMAT,
  CAIDE_PACKAGE_VERSION,
  ProjectPackageManifestSchema,
  ProjectPackageSecurityReportSchema,
  ProjectPackageInspectionSchema,
  ProjectPackageMetadataSchema,
  type ProjectPackageManifest,
  type ProjectPackageSecurityReport,
  type ProjectPackageInspection,
  type ProjectPackageMetadata,
} from "./projectPackageManifest.ts";
export {
  ProjectPackageError,
  exportProjectPackage,
  inspectProjectPackage,
  importProjectPackage,
  type ExportProjectPackageParams,
  type ExportProjectPackageResult,
  type InspectProjectPackageResult,
  type ImportProjectPackageParams,
  type ImportProjectPackageResult,
} from "./projectPackage.ts";
export {
  DEFAULT_PACKAGE_LIMITS,
  sha256File,
  writeProjectArchive,
  readProjectArchive,
  type ArchiveFileInput,
  type ArchiveWriteInput,
  type ArchiveReadOptions,
  type JsonValue,
} from "./projectPackageArchive.ts";
