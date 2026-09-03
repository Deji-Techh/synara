// FILE: mcpKeys.ts
// Purpose: MCP tool-key helpers (server__tool composite keys + sanitizing).
// Donor: dyad x caide src/ipc/utils/mcp_tool_utils.ts (verbatim).

/** Separator used between server name and tool name in MCP tool keys. */
export const MCP_TOOL_KEY_SEPARATOR = "__";

/**
 * Parse an MCP tool key into its component parts.
 * Tool keys are formatted as "serverName__toolName".
 */
export function parseMcpToolKey(toolKey: string): {
  serverName: string;
  toolName: string;
} {
  const lastIndex = toolKey.lastIndexOf(MCP_TOOL_KEY_SEPARATOR);
  if (lastIndex === -1) {
    return { serverName: "", toolName: toolKey };
  }
  const serverName = toolKey.slice(0, lastIndex);
  const toolName = toolKey.slice(lastIndex + MCP_TOOL_KEY_SEPARATOR.length);
  return { serverName, toolName };
}

/** Build an MCP tool key from server name and tool name. */
export function buildMcpToolKey(serverName: string, toolName: string): string {
  return `${serverName}${MCP_TOOL_KEY_SEPARATOR}${toolName}`;
}

/**
 * Sanitize a name for use in an MCP tool key.
 * Replaces any characters that aren't alphanumeric, underscore, or hyphen with a hyphen.
 */
export function sanitizeMcpName(name: string): string {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, "-");
}
