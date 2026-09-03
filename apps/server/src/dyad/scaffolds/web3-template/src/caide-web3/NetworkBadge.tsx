import { useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { EVM_CHAIN_NAMES } from "./chains";

export function NetworkBadge() {
  const wagmiAccount = useAccount();
  const solanaWallet = useWallet();

  const evmChainId = wagmiAccount.chainId;
  const solanaCluster = solanaWallet.wallet?.adapter.name ?? null;

  if (evmChainId && EVM_CHAIN_NAMES[evmChainId]) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {EVM_CHAIN_NAMES[evmChainId]}
      </span>
    );
  }

  if (solanaWallet.connected) {
    const name = solanaCluster ?? "Solana";
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {name}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      Not Connected
    </span>
  );
}
