// FILE: mcpTools.ts
// Purpose: MCP discovery agent tools (search by keyword, fetch signatures)
// on the Caide defineTool DSL. Tool definitions read from a session-scoped
// McpToolRegistry (the M4 manager/DB layer provides it; tests inject fakes).
// Donor: dyad x caide tools/{search_mcp_tools,get_mcp_tool_schema}.ts —
// descriptions, MAX_RESULTS=5, server scoping, footers, and empty-state
// messages kept verbatim. Execution calls MCP tools directly (no sandbox
// host-function detour — Caide executes them as tools, M4 wires transport).

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { bm25Ranker } from "./bm25.ts";
import { sanitizeMcpName } from "./mcpKeys.ts";

/** Minimal JSON-schema shape for MCP tool input schemas (no AI-SDK dep). */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpToolDef {
  /** JS-safe function identifier. */
  jsName: string;
  /** Original MCP tool key (serverName__toolName). */
  toolKey: string;
  serverId: number | string;
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface McpToolRegistry {
  listTools(): McpToolDef[];
}

let registry: McpToolRegistry | null = null;
export function setMcpToolRegistry(r: McpToolRegistry | null): void {
  registry = r;
}
export function getMcpToolRegistry(): McpToolRegistry | null {
  return registry;
}

/**
 * Number of matching tools whose full TypeScript declarations are returned.
 * Kept small on purpose: the point of search is to keep context lean. The
 * model can refine its query (or pass a `server`) to reach the rest.
 */
export const MCP_MAX_RESULTS = 5;

function toJsIdentifier(name: string): string {
  let id = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[0-9]/.test(id)) id = `_${id}`;
  return id;
}

function tsTypeOf(schema: JsonSchema | undefined): string {
  if (!schema || typeof schema !== "object") return "unknown";
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

/** Render `declare function` signatures for tool defs (donor shape). */
export function buildMcpTypeDefsBlock(defs: McpToolDef[]): string {
  return defs
    .map((d) => {
      const props = d.inputSchema?.properties ?? {};
      const required = new Set(d.inputSchema?.required ?? []);
      const params = Object.entries(props)
        .map(([name, s]) => `${toJsIdentifier(name)}${required.has(name) ? "" : "?"}: ${tsTypeOf(s)}`)
        .join("; ");
      const desc = d.description ? `\n// ${d.description}` : "";
      return `${desc}\ndeclare function ${d.jsName}(args: { ${params} }): Promise<McpResult>;`;
    })
    .join("\n\n");
}

function matchesServer(def: McpToolDef, server: string): boolean {
  const a = def.serverName ?? "";
  return a.toLowerCase() === server.toLowerCase() || sanitizeMcpName(a) === sanitizeMcpName(server);
}

function uniqueServerNames(defs: McpToolDef[]): string[] {
  return [...new Set(defs.map((d) => d.serverName).filter(Boolean))];
}

// --- search_mcp_tools (donor description verbatim) ---

const searchMcpToolsSchema = z.object({
  query: z.string().describe("Keywords describing the MCP tool you need (e.g. 'create github issue', 'send slack message')."),
  server: z.string().optional().describe("Optional. Restrict the search to a single MCP server by name. Omit to search across all enabled servers."),
});

export const searchMcpToolsTool = defineTool({
  name: "search_mcp_tools",
  description:
    "Search for MCP tools by keyword and get their TypeScript signatures. " +
    "Use this before calling an MCP tool: search for what you need, then call it. " +
    "Pass `server` to restrict the search to one MCP server.",
  schema: searchMcpToolsSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => executeSearchMcpTools(searchMcpToolsSchema.parse(args)),
  presentCall: (args: any) =>
    args.server
      ? `Search MCP tools for "${args.query}" (server: ${args.server})`
      : `Search MCP tools for "${args.query}"`,
});

export function executeSearchMcpTools(input: z.infer<typeof searchMcpToolsSchema>): string {
  const parsed = searchMcpToolsSchema.parse(input);
  const allDefs = registry?.listTools();
  if (!allDefs) {
    return "MCP tools are temporarily unavailable. Try again.";
  }
  const scoped = parsed.server ? allDefs.filter((d) => matchesServer(d, parsed.server!)) : allDefs;
  if (scoped.length === 0) {
    const servers = uniqueServerNames(allDefs);
    const hint =
      parsed.server && servers.length > 0
        ? ` No MCP server named "${parsed.server}". Available servers: ${servers.join(", ")}.`
        : servers.length > 0
          ? ` Available servers: ${servers.join(", ")}.`
          : " No MCP servers are enabled.";
    return `No MCP tools available to search.${hint}`;
  }
  const ranked = bm25Ranker(parsed.query, scoped);
  if (ranked.length === 0) {
    const servers = uniqueServerNames(scoped);
    return (
      `No MCP tools matched "${parsed.query}". Try different keywords. ` +
      `Searched ${scoped.length} tool(s) across: ${servers.join(", ")}.`
    );
  }
  const top = ranked.slice(0, MCP_MAX_RESULTS).map((r) => r.def);
  const block = buildMcpTypeDefsBlock(top);
  const remaining = ranked.length - top.length;
  const footer =
    remaining > 0
      ? `\n\n// ${remaining} more tool(s) matched "${parsed.query}". Refine the query or pass \`server\` to narrow.`
      : "";
  return `Top ${top.length} MCP tool(s) for "${parsed.query}":\n\n${block}${footer}`;
}

// --- get_mcp_tool_schema (donor description verbatim) ---

const getMcpToolSchemaSchema = z.object({
  tools: z
    .array(z.string())
    .min(1)
    .describe("Names of the MCP tools to fetch full TypeScript signatures for (e.g. ['github__issue_write'])."),
});

export const getMcpToolSchemaTool = defineTool({
  name: "get_mcp_tool_schema",
  description:
    "Get the description and full TypeScript signature of MCP tools by name. " +
    "Call this to get a tool's description and input schema before calling it. " +
    "If a name is shared by tools on more than one server, the signatures for all of them are returned.",
  schema: getMcpToolSchemaSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => executeGetMcpToolSchema(getMcpToolSchemaSchema.parse(args)),
  presentCall: (args: any) => `Get schema for MCP tool(s): ${args.tools.join(", ")}`,
});

export function resolveMcpToolDefs(
  defs: McpToolDef[],
  names: string[],
): { found: McpToolDef[]; missing: string[] } {
  const found: McpToolDef[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const matches = defs.filter(
      (d) => d.toolKey === name || d.jsName === name || d.toolName === name,
    );
    if (matches.length === 0) missing.push(name);
    else found.push(...matches);
  }
  return { found, missing };
}

export function executeGetMcpToolSchema(input: z.infer<typeof getMcpToolSchemaSchema>): string {
  const parsed = getMcpToolSchemaSchema.parse(input);
  const allDefs = registry?.listTools();
  if (!allDefs) {
    return "MCP tools are temporarily unavailable. Try again.";
  }
  const { found, missing } = resolveMcpToolDefs(allDefs, parsed.tools);
  if (found.length === 0) {
    return (
      `No MCP tool matched [${parsed.tools.join(", ")}]. Use the names exactly ` +
      `as listed, or search_mcp_tools to find one.`
    );
  }
  const block = buildMcpTypeDefsBlock(found);
  const missingNote = missing.length > 0 ? `\n\n// No match for: ${missing.join(", ")}` : "";
  return `Signature(s) for ${found.length} MCP tool(s):\n\n${block}${missingNote}`;
}

export const ALL_MCP_TOOLS: ToolDef[] = [searchMcpToolsTool, getMcpToolSchemaTool];
