// FILE: networks.ts
// Purpose: Blockchain RPC network registry + live RPC tests (donor
// testEvmRpc/testSolanaRpc shapes: chain id + block height must both answer;
// version + height for Solana). Registry is fed by settings_sync (client
// Database panel) with a localhost default; test_rpc lets the agent verify
// a network before building against it.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

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

const registry = new Map<string, BlockchainNetwork>();

export function setBlockchainNetworks(networks: BlockchainNetwork[]): void {
  registry.clear();
  for (const n of networks) {
    if (n.id && n.rpcUrl) registry.set(n.id, { ...n, isActive: n.isActive !== false });
  }
}

export function listBlockchainNetworks(): BlockchainNetwork[] {
  return [...registry.values()];
}

export function clearBlockchainNetworks(): void {
  registry.clear();
}

const RPC_TIMEOUT_MS = 5_000;

async function rpcCall(rpcUrl: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
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
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Donor testEvmRpc shape: eth_chainId + eth_blockNumber must both answer. */
export async function testEvmRpc(rpcUrl: string, signal?: AbortSignal): Promise<{ chainId: string; block: string }> {
  const [chain, block] = await Promise.all([
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }, signal),
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }, signal),
  ]);
  const chainId = (chain as { result?: string })?.result;
  const blockNumber = (block as { result?: string })?.result;
  if (typeof chainId !== "string" || typeof blockNumber !== "string") {
    throw new Error("RPC did not return chain id and block height.");
  }
  return { chainId, block: blockNumber };
}

/** Donor testSolanaRpc shape: getVersion + getBlockHeight must both answer. */
export async function testSolanaRpc(rpcUrl: string, signal?: AbortSignal): Promise<{ version: string; height: number }> {
  const [version, height] = await Promise.all([
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 1, method: "getVersion", params: [] }, signal),
    rpcCall(rpcUrl, { jsonrpc: "2.0", id: 2, method: "getBlockHeight", params: [] }, signal),
  ]);
  const v = (version as { result?: { "solana-core"?: string } })?.result?.["solana-core"];
  const h = (height as { result?: number })?.result;
  if (typeof v !== "string" || typeof h !== "number") {
    throw new Error("RPC did not return version and block height.");
  }
  return { version: v, height: h };
}

export async function testNetwork(network: BlockchainNetwork, signal?: AbortSignal): Promise<string> {
  try {
    if (network.chainKind === "evm") {
      const r = await testEvmRpc(network.rpcUrl, signal);
      return `${network.name}: OK (chain ${r.chainId}, block ${r.block})`;
    }
    const r = await testSolanaRpc(network.rpcUrl, signal);
    return `${network.name}: OK (v${r.version}, slot ${r.height})`;
  } catch (err) {
    return `${network.name}: FAILED (${err instanceof Error ? err.message : String(err)})`;
  }
}

const testRpcSchema = z.object({
  networkId: z.string().optional().describe("Network id to test (omit to test all active networks)"),
});

export const testRpcTool = defineTool({
  name: "test_rpc",
  description:
    "Test blockchain RPC connectivity (chain id + block height for EVM, version + slot for Solana). Use before building web3 features to confirm the configured network answers.",
  schema: testRpcSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = testRpcSchema.parse(args);
    const networks = listBlockchainNetworks().filter((n) => n.isActive);
    if (networks.length === 0) {
      return "No blockchain networks configured. Add EVM or Solana RPCs in Settings → Database → Blockchain networks.";
    }
    const targets = parsed.networkId ? networks.filter((n) => n.id === parsed.networkId) : networks;
    if (targets.length === 0) return `No network matched id "${parsed.networkId}".`;
    const results = await Promise.all(targets.map((n) => testNetwork(n, ctx.signal)));
    return results.join("\n");
  },
  presentCall: (args: any) => (args.networkId ? `Test RPC: ${args.networkId}` : "Test all RPCs"),
});

export const ALL_WEB3_TOOLS: ToolDef[] = [testRpcTool];
