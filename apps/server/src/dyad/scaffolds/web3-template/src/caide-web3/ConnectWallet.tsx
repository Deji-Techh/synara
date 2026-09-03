import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { Wallet, LogOut } from "lucide-react";

type WalletType = "evm" | "solana" | null;

export function ConnectWallet() {
  const wagmiAccount = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const solanaWallet = useWallet();

  const [walletType, setWalletType] = useState<WalletType>(null);

  const evmAddress = wagmiAccount.address;
  const solanaAddress = solanaWallet.publicKey?.toBase58();

  const connectedAddress = evmAddress ?? solanaAddress ?? null;
  const isConnected = !!connectedAddress;

  const handleConnect = useCallback(async () => {
    if (solanaWallet.wallet && !solanaWallet.connected) {
      try {
        await solanaWallet.connect();
        setWalletType("solana");
      } catch {}
      return;
    }
    const injectedConnector = connectors.find(
      (c) => c.id === "injected" || c.name.toLowerCase().includes("injected"),
    );
    if (injectedConnector) {
      connect({ connector: injectedConnector });
      setWalletType("evm");
    }
  }, [connectors, connect, solanaWallet]);

  const handleDisconnect = useCallback(() => {
    if (walletType === "evm" || evmAddress) {
      disconnect();
    }
    if (solanaWallet.connected) {
      solanaWallet.disconnect();
    }
    setWalletType(null);
  }, [disconnect, evmAddress, solanaWallet]);

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <Wallet className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs">
          {connectedAddress!.slice(0, 6)}...{connectedAddress!.slice(-4)}
        </span>
        <button
          onClick={handleDisconnect}
          className="ml-1 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </button>
  );
}
