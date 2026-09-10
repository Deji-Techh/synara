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
