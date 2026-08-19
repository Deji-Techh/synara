---
name: web3-wallet
description: Multi-chain wallet connection using wagmi for EVM and @solana/wallet-adapter for Solana. Covers connection, disconnection, signing, and chain switching.
context: inline
---

# Multi-Chain Wallet Connection Guide

## EVM Wallet Connection (wagmi)

- `useAccount()` — connected address, chain ID, connection status
- `useConnect()` — available connectors (MetaMask, WalletConnect, Coinbase)
- `useDisconnect()` — disconnect wallet
- `useBalance()` — native token balance
- `useSendTransaction()` — send transactions
- `useSignMessage()` — sign messages for authentication
- `useSwitchChain()` — switch networks

## Solana Wallet Connection

- `useWallet()` — connected public key, wallet adapter, connection status
- `useConnection()` — RPC connection object
- `@solana/wallet-adapter-react` provides React context
- `@solana/wallet-adapter-wallets` provides wallet implementations
- Supported wallets: Phantom, Solflare, Backpack, Glow, etc.

## Multi-Chain Architecture

- Keep connection state separate per chain ecosystem
- Detect chain type from address format:
  - EVM: `0x` prefix, 42 chars
  - Solana: base58, 32-44 chars
- Normalize address display (truncate middle)
- Switch network when user selects a different chain
- Handle chain-specific transaction formats

## Best Practices

- Connect/Disconnect buttons should handle both ecosystems
- Show network badge with status indicator
- Always handle wallet rejection gracefully
- Show loading state during connection
- Store last connected wallet type for reconnection
- Never request wallet connection on page load (user gesture required)
