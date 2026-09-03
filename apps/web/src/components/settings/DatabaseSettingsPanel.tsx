// FILE: DatabaseSettingsPanel.tsx
// Purpose: Settings → Database — Supabase/Neon connections the agent links
// via add_integration, plus blockchain RPC networks with live RPC tests
// (donor testEvmRpc/testSolanaRpc shapes). Local-first; M3g persists.

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { SettingsListRow, SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import {
  loadConnections,
  loadNetworks,
  newConnectionId,
  newNetworkId,
  saveConnections,
  saveNetworks,
  testEvmRpc,
  testSolanaRpc,
  validateConnection,
  validateNetwork,
  type BlockchainNetwork,
  type DbConnection,
  type DbProviderKind,
} from "./databaseSettingsStore";

type NetTest =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; detail: string }
  | { state: "error"; detail: string };

export function DatabaseSettingsPanel(props: { active: boolean }) {
  const [connections, setConnections] = useState<DbConnection[]>(() => loadConnections());
  const [networks, setNetworks] = useState<BlockchainNetwork[]>(() => loadNetworks());
  const [addingConn, setAddingConn] = useState(false);
  const [addingNet, setAddingNet] = useState(false);
  const [connDraft, setConnDraft] = useState({ name: "", provider: "supabase" as DbProviderKind, databaseUrl: "", projectId: "" });
  const [netDraft, setNetDraft] = useState({ name: "", chainKind: "evm" as const, chainId: "", rpcUrl: "", explorerUrl: "" });
  const [netTests, setNetTests] = useState<Record<string, NetTest>>({});

  if (!props.active) return null;

  const persistConns = (next: DbConnection[]) => {
    setConnections(next);
    saveConnections(next);
  };
  const persistNets = (next: BlockchainNetwork[]) => {
    setNetworks(next);
    saveNetworks(next);
  };

  const connProblems = validateConnection({ ...connDraft, id: "" }, connections);
  const netProblems = validateNetwork({ ...netDraft, id: "" }, networks);

  const addConnection = () => {
    if (connProblems.length > 0) return;
    persistConns([
      ...connections,
      {
        id: newConnectionId(),
        name: connDraft.name.trim(),
        provider: connDraft.provider,
        databaseUrl: connDraft.databaseUrl.trim(),
        projectId: connDraft.projectId.trim() || undefined,
        enabled: true,
        createdAt: Date.now(),
      },
    ]);
    setConnDraft({ name: "", provider: "supabase", databaseUrl: "", projectId: "" });
    setAddingConn(false);
    toastManager.add({ type: "success", title: "Database connection saved" });
  };

  const addNetwork = () => {
    if (netProblems.length > 0) return;
    persistNets([
      ...networks,
      {
        id: newNetworkId(),
        name: netDraft.name.trim(),
        chainKind: netDraft.chainKind,
        chainId: netDraft.chainId.trim(),
        rpcUrl: netDraft.rpcUrl.trim(),
        explorerUrl: netDraft.explorerUrl.trim() || undefined,
        isActive: true,
      },
    ]);
    setNetDraft({ name: "", chainKind: "evm", chainId: "", rpcUrl: "", explorerUrl: "" });
    setAddingNet(false);
    toastManager.add({ type: "success", title: "Network saved" });
  };

  const testNetwork = async (net: BlockchainNetwork) => {
    setNetTests((prev) => ({ ...prev, [net.id]: { state: "testing" } }));
    try {
      const detail =
        net.chainKind === "evm"
          ? await testEvmRpc(net.rpcUrl).then((r) => `chain ${r.chainId} · block ${r.block}`)
          : await testSolanaRpc(net.rpcUrl).then((r) => `v${r.version} · slot ${r.height}`);
      setNetTests((prev) => ({ ...prev, [net.id]: { state: "ok", detail } }));
    } catch (error) {
      setNetTests((prev) => ({
        ...prev,
        [net.id]: { state: "error", detail: error instanceof Error ? error.message : "RPC unreachable" },
      }));
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Database connections"
        action={
          <Button size="xs" variant="outline" onClick={() => setAddingConn((v) => !v)} aria-expanded={addingConn}>
            Add connection
            <DisclosureChevron open={addingConn} className="ml-1 size-3.5" />
          </Button>
        }
      >
        <DisclosureRegion open={addingConn} contentClassName="mt-3 space-y-3 border-t border-border/70 pt-3">
          <SettingsRow
            title="Provider"
            description="Supabase covers most needs without a server layer; Neon provisions one automatically."
            control={
              <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
                {(["supabase", "neon"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setConnDraft({ ...connDraft, provider: p })}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      connDraft.provider === p ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            }
          />
          <SettingsRow
            title="Name"
            description="Label for consent prompts and the agent."
            control={
              <Input className="w-full sm:w-64" value={connDraft.name} placeholder="Production" onChange={(e) => setConnDraft({ ...connDraft, name: e.target.value })} />
            }
          />
          <SettingsRow
            title="DATABASE_URL"
            description="Stored locally; the agent links it per session via add_integration."
            control={
              <Input
                className="w-full sm:w-64 font-mono text-[11px]"
                type="password"
                value={connDraft.databaseUrl}
                placeholder="postgres://…"
                onChange={(e) => setConnDraft({ ...connDraft, databaseUrl: e.target.value })}
              />
            }
          />
          {connProblems.length > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {connProblems.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button size="sm" disabled={connProblems.length > 0} onClick={addConnection}>
              Save connection
            </Button>
          </div>
        </DisclosureRegion>
      </SettingsSection>

      <SettingsSection title={`Saved connections (${connections.filter((c) => c.enabled).length}/${connections.length})`}>
        {connections.length === 0 ? (
          <SettingsListRow
            title="No connections"
            description="Add Supabase or Neon above, or let the agent ask via add_integration when database work starts."
          />
        ) : (
          connections.map((conn) => (
            <SettingsListRow
              key={conn.id}
              align="start"
              title={conn.name}
              description={
                <div className="space-y-1">
                  <div className="capitalize">{conn.provider}</div>
                  {conn.projectId ? <div className="font-mono text-[11px]">project {conn.projectId}</div> : null}
                </div>
              }
              actions={
                <div className="flex items-center gap-2">
                  <Switch
                    checked={conn.enabled}
                    onCheckedChange={(enabled) => persistConns(connections.map((c) => (c.id === conn.id ? { ...c, enabled } : c)))}
                    aria-label={`Enable ${conn.name}`}
                  />
                  <Button size="xs" variant="destructive-outline" onClick={() => persistConns(connections.filter((c) => c.id !== conn.id))}>
                    Remove
                  </Button>
                </div>
              }
            />
          ))
        )}
      </SettingsSection>

      <SettingsSection
        title="Blockchain networks"
        action={
          <Button size="xs" variant="outline" onClick={() => setAddingNet((v) => !v)} aria-expanded={addingNet}>
            Add network
            <DisclosureChevron open={addingNet} className="ml-1 size-3.5" />
          </Button>
        }
      >
        <DisclosureRegion open={addingNet} contentClassName="mt-3 space-y-3 border-t border-border/70 pt-3">
          <SettingsRow
            title="Chain"
            description="EVM chains answer eth_chainId; Solana answers getVersion."
            control={
              <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
                {(["evm", "solana"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setNetDraft({ ...netDraft, chainKind: k })}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      netDraft.chainKind === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "evm" ? "EVM" : "Solana"}
                  </button>
                ))}
              </div>
            }
          />
          <SettingsRow
            title="Name"
            description="e.g. Ethereum, Base, Solana mainnet."
            control={
              <Input className="w-full sm:w-64" value={netDraft.name} onChange={(e) => setNetDraft({ ...netDraft, name: e.target.value })} />
            }
          />
          <SettingsRow
            title="Chain ID"
            description="EVM chain id (1, 137…) or solana-mainnet."
            control={
              <Input className="w-full sm:w-64 font-mono text-[11px]" value={netDraft.chainId} onChange={(e) => setNetDraft({ ...netDraft, chainId: e.target.value })} />
            }
          />
          <SettingsRow
            title="RPC URL"
            description="Tested live on save-demand with a 5s timeout."
            control={
              <Input className="w-full sm:w-64 font-mono text-[11px]" value={netDraft.rpcUrl} placeholder="https://…" onChange={(e) => setNetDraft({ ...netDraft, rpcUrl: e.target.value })} />
            }
          />
          {netProblems.length > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {netProblems.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button size="sm" disabled={netProblems.length > 0} onClick={addNetwork}>
              Save network
            </Button>
          </div>
        </DisclosureRegion>
      </SettingsSection>

      <SettingsSection title={`Saved networks (${networks.filter((n) => n.isActive).length}/${networks.length})`}>
        {networks.length === 0 ? (
          <SettingsListRow title="No networks" description="Add EVM or Solana RPCs for web3 builds." />
        ) : (
          networks.map((net) => {
            const test = netTests[net.id] ?? { state: "idle" as const };
            return (
              <SettingsListRow
                key={net.id}
                align="start"
                title={net.name}
                description={
                  <div className="space-y-1">
                    <div className="font-mono text-[11px]">
                      {net.chainKind === "evm" ? "EVM" : "Solana"} · {net.chainId}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{net.rpcUrl}</div>
                    {test.state === "ok" ? (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">{test.detail}</div>
                    ) : null}
                    {test.state === "error" ? (
                      <div className="text-[11px] text-destructive">{test.detail}</div>
                    ) : null}
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <Button size="xs" variant="outline" disabled={test.state === "testing"} onClick={() => void testNetwork(net)}>
                      {test.state === "testing" ? "Testing…" : "Test RPC"}
                    </Button>
                    <Switch
                      checked={net.isActive}
                      onCheckedChange={(isActive) => persistNets(networks.map((n) => (n.id === net.id ? { ...n, isActive } : n)))}
                      aria-label={`Enable ${net.name}`}
                    />
                    <Button size="xs" variant="destructive-outline" onClick={() => persistNets(networks.filter((n) => n.id !== net.id))}>
                      Remove
                    </Button>
                  </div>
                }
              />
            );
          })
        )}
      </SettingsSection>
    </div>
  );
}
