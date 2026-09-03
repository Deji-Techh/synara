import { type Chain } from "viem";
import {
  mainnet,
  sepolia,
  polygon,
  base,
  arbitrum,
  optimism,
} from "viem/chains";

export const EVM_CHAINS: [Chain, ...Chain[]] = [
  mainnet,
  sepolia,
  polygon,
  base,
  arbitrum,
  optimism,
];

export const EVM_CHAIN_NAMES: Record<number, string> = {
  [mainnet.id]: "Ethereum",
  [sepolia.id]: "Sepolia",
  [polygon.id]: "Polygon",
  [base.id]: "Base",
  [arbitrum.id]: "Arbitrum",
  [optimism.id]: "Optimism",
};

export interface SolanaCluster {
  id: string;
  name: string;
  endpoint: string;
  explorerUrl: string;
}

export const SOLANA_CLUSTERS: SolanaCluster[] = [
  {
    id: "solana-mainnet",
    name: "Solana Mainnet",
    endpoint: "https://api.mainnet-beta.solana.com",
    explorerUrl: "https://explorer.solana.com",
  },
  {
    id: "solana-devnet",
    name: "Solana Devnet",
    endpoint: "https://api.devnet.solana.com",
    explorerUrl: "https://explorer.solana.com/?cluster=devnet",
  },
];

export interface NetworkConfig {
  type: "solana" | "evm";
  chainId: string;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const DEFAULT_NETWORKS: NetworkConfig[] = [
  {
    type: "evm",
    chainId: String(mainnet.id),
    name: "Ethereum Mainnet",
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/demo",
    explorerUrl: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  {
    type: "evm",
    chainId: String(sepolia.id),
    name: "Sepolia Testnet",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  {
    type: "evm",
    chainId: String(polygon.id),
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  },
  {
    type: "evm",
    chainId: String(base.id),
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  {
    type: "solana",
    chainId: "solana-mainnet",
    name: "Solana Mainnet",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    explorerUrl: "https://explorer.solana.com",
    nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
  },
  {
    type: "solana",
    chainId: "solana-devnet",
    name: "Solana Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    explorerUrl: "https://explorer.solana.com/?cluster=devnet",
    nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
  },
];
