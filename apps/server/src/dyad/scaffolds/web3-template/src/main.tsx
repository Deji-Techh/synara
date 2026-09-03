import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getDefaultConfig } from "@web3modal/wagmi";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import App from "./App.tsx";
import "./globals.css";

const queryClient = new QueryClient();

const wagmiConfig = getDefaultConfig({
  appName: "CAIDE dApp",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID",
  chains: [
    {
      id: 1,
      name: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: ["https://eth-mainnet.g.alchemy.com/v2/demo"] },
      },
    },
    {
      id: 11155111,
      name: "Sepolia",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: ["https://eth-sepolia.g.alchemy.com/v2/demo"] },
      },
    },
    {
      id: 137,
      name: "Polygon",
      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
      rpcUrls: { default: { http: ["https://polygon-rpc.com"] } },
    },
    {
      id: 8453,
      name: "Base",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
    },
  ],
  ssr: true,
});

const solanaEndpoint = clusterApiUrl("devnet");
const solanaWallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={solanaEndpoint}>
        <WalletProvider wallets={solanaWallets} autoConnect>
          <App />
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  </WagmiProvider>,
);
