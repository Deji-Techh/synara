// FILE: mcpServersStore.ts
// Purpose: Client-side MCP server registry for Settings (Dyad-style: servers
// the agent connects TO). Persisted to localStorage; a server transport
// (M4 manager) can take over listing/testing later via McpServersTransport.
// Replaces the old outbound-pairing model (ExternalMcpSettingsPanel).

export type McpTransportKind = "stdio" | "sse" | "oauth";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransportKind;
  enabled: boolean;
  /** stdio: command + args + env. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** sse/oauth: endpoint URL. */
  url?: string;
  headers?: Record<string, string>;
  /** oauth: client credentials + authorize endpoint. */
  clientId?: string;
  authorizeUrl?: string;
  /** Per-server default tool consent (ask/always/never). */
  defaultConsent?: "ask" | "always" | "never";
  createdAt: number;
}

export interface McpPrefs {
  autoApproveSafe: boolean;
}

const SERVERS_KEY = "caide.mcp-servers.v1";
const PREFS_KEY = "caide.mcp-prefs.v1";

function uid(): string {
  return `mcp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newServerId(): string {
  return uid();
}

export function defaultPrefs(): McpPrefs {
  return { autoApproveSafe: true };
}

export function loadServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as McpServerConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveServers(servers: McpServerConfig[]): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

export function loadPrefs(): McpPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<McpPrefs>;
    return { autoApproveSafe: parsed.autoApproveSafe !== false };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(prefs: McpPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** Config validation — returns human-readable problems (empty = valid). */
export function validateServer(input: Partial<McpServerConfig>, siblings: McpServerConfig[]): string[] {
  const problems: string[] = [];
  const name = (input.name ?? "").trim();
  if (!name) problems.push("Name is required.");
  else if (siblings.some((s) => s.id !== input.id && s.name.trim().toLowerCase() === name.toLowerCase())) {
    problems.push(`Another server is already named "${name}".`);
  }
  if (input.transport === "stdio" && !(input.command ?? "").trim()) {
    problems.push("Command is required for stdio servers (e.g. npx, uvx, node).");
  }
  if ((input.transport === "sse" || input.transport === "oauth") && !/^https?:\/\//.test(input.url ?? "")) {
    problems.push("A valid http(s) URL is required.");
  }
  if (input.transport === "oauth" && !(input.authorizeUrl ?? "").trim()) {
    problems.push("Authorize URL is required for OAuth servers.");
  }
  return problems;
}

/** Future server-side manager seam (M4): list/test against the live manager. */
export interface McpServersTransport {
  listServers(): Promise<McpServerConfig[]>;
  testServer(id: string): Promise<{ ok: boolean; message: string }>;
}
