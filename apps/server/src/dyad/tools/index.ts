// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant tool layer (consent + catalog).

export {
  TOOL_CATALOG,
  PLAN_MODE_ONLY_TOOLS,
  PLANNING_SPECIFIC_TOOLS,
  APP_BLUEPRINT_TOOLS,
  CAPABILITY_GATED_BLUEPRINT_TOOLS,
  BUILD_PROFILE_TOOLS,
  getToolMeta,
  getDefaultConsent,
  type ToolMeta,
  type ToolConsent,
  type CaideMapping,
} from "./toolCatalog.ts";
export {
  MemoryConsentStore,
  waitForConsent,
  resolveConsent,
  clearPendingConsentsForSession,
  getAgentToolConsent,
  setAgentToolConsent,
  getAllAgentToolConsents,
  shouldAutoApproveAgentTool,
  requireAgentToolConsent,
  shouldIncludeTool,
  toolNamesForTurn,
  ToolNeverAllowedError,
  type ConsentStore,
  type ConsentDecision,
  type ConsentRequest,
  type ConsentRequestFn,
  type ToolSetOptions,
  type InclusionContext,
  type SqlConsentMetadata,
} from "./permissions.ts";
