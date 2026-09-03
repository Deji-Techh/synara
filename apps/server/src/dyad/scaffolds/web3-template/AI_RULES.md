# Tech Stack

- You are building a multi-chain web3 dApp.
- Use TypeScript.
- Use React Router. KEEP the routes in src/App.tsx
- Always put source code in the src folder.
- Put pages into src/pages/
- Put components into src/components/
- The main page (default page) is src/pages/Index.tsx
- UPDATE the main page to include the new components.
- Tailwind CSS: always use Tailwind CSS for styling components.

# Multi-Chain Web3 Development

This project supports both Solana and EVM-compatible chains.

## Wallet Connection

- EVM wallet connection is handled by wagmi + Web3Modal (configured in src/main.tsx)
- Solana wallet connection is handled by @solana/wallet-adapter-react (configured in src/main.tsx)
- Pre-built wallet components live in src/caide-web3/:
  - ConnectWallet: Universal connect/disconnect button
  - NetworkBadge: Shows current connected network
  - AccountBalance: Displays native balance for connected wallet
  - TransactionButton: Sends transactions with status feedback
- Chains config is in src/caide-web3/chains.ts

## Available Libraries

- **Solana**: @solana/web3.js, @solana/wallet-adapter-react, @solana/wallet-adapter-wallets, @coral-xyz/anchor
- **EVM**: viem, wagmi, ethers, @web3modal/wagmi
- **UI**: shadcn/ui components, lucide-react, Tailwind CSS

## Smart Contracts

- Solana Anchor contracts: contracts/anchor/
- EVM Hardhat contracts: contracts/hardhat/
- To compile: npm run compile

## Development Guidelines

- Use viem/ethers for EVM chain interactions
- Use @solana/web3.js for Solana interactions
- Always handle wallet disconnection gracefully
- Show loading states during transactions
- Validate addresses before sending transactions
- Use try/catch around all blockchain RPC calls
- Never hardcode private keys or seed phrases
- Never expose RPC URLs with API keys in client code
