import { ConnectWallet } from "@/caide-web3/ConnectWallet";
import { NetworkBadge } from "@/caide-web3/NetworkBadge";
import { AccountBalance } from "@/caide-web3/AccountBalance";

export default function Index() {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Multi-Chain dApp</h1>
        <p className="max-w-md text-muted-foreground">
          Connect your wallet to interact with Solana and EVM chains.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <ConnectWallet />
        <NetworkBadge />
      </div>

      <AccountBalance />

      <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        <p>
          This app supports <strong>Solana</strong> and <strong>EVM</strong>{" "}
          chains (Ethereum, Polygon, Base, Arbitrum, Optimism).
        </p>
        <p>
          Use the AI chat to build your dApp features — tokens, NFTs, DeFi, and
          more.
        </p>
      </div>
    </main>
  );
}
