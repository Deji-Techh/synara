// FILE: databaseSettingsStore.ts
// Purpose: Supabase/Neon connections + blockchain RPC networks for
// Settings → Database. Local-first (M3g persists server-side); the agent
// reads these via the session connection store once the WS layer bridges
// them (same shape as dyad/db linkDatabase).

export type DbProviderKind = "supabase" | "neon";

export interface DbConnection {
  id: string;
  provider: DbProviderKind;
  name: string;
  databaseUrl: string;
  projectId?: string;
  enabled: boolean;
  createdAt: number;
}

export type ChainKind = "evm" | "solana";

export interface BlockchainNetwork {
  id: string;
  chainKind: ChainKind;
  chainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  isActive: boolean;
}

const CONNECTIONS_KEY = "caide.db-connections.v1";
const NETWORKS_KEY = "caide.blockchain-networks.v1";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newConnectionId(): string {
  return uid("dbc");
}

export function newNetworkId(): string {
  return uid("net");
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadConnections(): DbConnection[] {
  return readList<DbConnection>(CONNECTIONS_KEY);
}

export function saveConnections(connections: DbConnection[]): void {
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
}

export function loadNetworks(): BlockchainNetwork[] {
  return readList<BlockchainNetwork>(NETWORKS_KEY);
}

export function saveNetworks(networks: BlockchainNetwork[]): void {
  localStorage.setItem(NETWORKS_KEY, JSON.stringify(networks));
}

export function validateConnection(
  input: Partial<DbConnection>,
  siblings: DbConnection[],
): string[] {
  const problems: string[] = [];
  if (!(input.name ?? "").trim()) problems.push("Name is required.");
  else if (
    siblings.some(
      (s) => s.id !== input.id && s.name.trim().toLowerCase() === input.name!.trim().toLowerCase(),
    )
  ) {
    problems.push(`Another connection is already named "${input.name!.trim()}".`);
  }
  if (!/^(postgres(ql)?:\/\/|supabase:\/\/)/.test(input.databaseUrl ?? "")) {
    problems.push("DATABASE_URL must be a postgres:// connection string.");
  }
  return problems;
}

export function validateNetwork(
  input: Partial<BlockchainNetwork>,
  siblings: BlockchainNetwork[],
): string[] {
  const problems: string[] = [];
  if (!(input.name ?? "").trim()) problems.push("Name is required.");
  else if (
    siblings.some(
      (s) => s.id !== input.id && s.name.trim().toLowerCase() === input.name!.trim().toLowerCase(),
    )
  ) {
    problems.push(`Another network is already named "${input.name!.trim()}".`);
  }
  if (!/^https?:\/\//.test(input.rpcUrl ?? "")) problems.push("A valid http(s) RPC URL is required.");
  if (!(input.chainId ?? "").trim()) problems.push("Chain ID is required (e.g. 1, 137, solana-mainnet).");
  return problems;
}

async function rpcCall(rpcUrl: string, body: unknown, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Donor testEvmRpc shape: chain id + block height must both answer. */
export async function testEvmRpc(rpcUrl: string): Promise<{ chainId: string; block: string }> {
  const [chain, block] = await Promise.all([
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
  ]);
  const chainId = (chain as { result?: string })?.result;
  const blockNumber = (block as { result?: string })?.result;
  if (typeof chainId !== "string" || typeof blockNumber !== "string") {
    throw new Error("RPC did not return chain id and block height.");
  }
  return { chainId, block: blockNumber };
}

/** Donor testSolanaRpc shape: version + block height must both answer. */
export async function testSolanaRpc(rpcUrl: string): Promise<{ version: string; height: number }> {
  const [version, height] = await Promise.all([
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 1, method: "getVersion", params: [] }),
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 2, method: "getBlockHeight", params: [] }),
  ]);
  const v = (version as { result?: { "solana-core"?: string } })?.result?.["solana-core"];
  const h = (height as { result?: number })?.result;
  if (typeof v !== "string" || typeof h !== "number") {
    throw new Error("RPC did not return version and block height.");
  }
  return { version: v, height: h };
}
