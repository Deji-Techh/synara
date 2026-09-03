// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant MCP layer.

export {
  MCP_TOOL_KEY_SEPARATOR,
  parseMcpToolKey,
  buildMcpToolKey,
  sanitizeMcpName,
} from "./mcpKeys.ts";
export {
  MCP_CONSENT_SCAFFOLD,
  MCP_CONSENT_POLICY,
  buildMcpConsentSystemPrompt,
} from "./mcpConsentPolicy.ts";
export { tokenize, buildToolDocument, bm25Ranker, type ToolRanker, type RankedTool } from "./bm25.ts";
export {
  MemoryMcpConsentStore,
  waitForMcpConsent,
  resolveMcpConsent,
  clearPendingMcpConsentsForSession,
  getMcpConsent,
  requireMcpToolConsent,
  type McpConsent,
  type McpConsentDecision,
  type McpConsentStore,
  type McpConsentRequest,
  type McpConsentRequestFn,
} from "./mcpConsent.ts";
export {
  ALL_MCP_TOOLS,
  MCP_MAX_RESULTS,
  searchMcpToolsTool,
  getMcpToolSchemaTool,
  executeSearchMcpTools,
  executeGetMcpToolSchema,
  resolveMcpToolDefs,
  buildMcpTypeDefsBlock,
  setMcpToolRegistry,
  getMcpToolRegistry,
  type McpToolDef,
  type McpToolRegistry,
  type JsonSchema,
} from "./mcpTools.ts";
export {
  McpConnection,
  McpManager,
  sharedMcpManager,
  McpError,
  MCP_RPC_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION,
  type ManagedMcpServer,
  type McpTransportConfig,
  type McpStdioConfig,
  type McpSseConfig,
} from "./manager.ts";
