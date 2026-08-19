---
name: web3-multichain
description: Multi-chain architecture for chain abstraction, network management, chain detection, and cross-chain considerations. Activate when the dApp supports multiple blockchains.
context: inline
---

# Multi-Chain Architecture Guide

## Chain Abstraction

- Abstract chain interactions behind an interface:
  - `getBalance(address, chainId)` -> native balance
  - `sendTransaction(tx, chainId)` -> tx hash
  - `readContract(address, abi, functionName, args, chainId)` -> result
- Implement for each supported chain ecosystem
- Use environment-aware config for RPC endpoints

## Network Management

- Read available networks from `caide-networks.json` (if present)
- Fall back to hardcoded defaults
- Validate RPC URLs before use
- Handle network switching gracefully
- Show connected network prominently in UI

## Chain Detection

- Read `window.ethereum` for EVM
- Read `window.solana` / `window.phantom` for Solana
- Detect when user has no wallet installed → show install prompts
- Support WalletConnect for mobile wallets

## Cross-Chain Considerations

- Address formats differ per chain (do not share addresses across chains)
- Transaction fees paid in native token of each chain
- Block times differ (Solana ~400ms, Ethereum ~12s)
- Confirmation requirements differ
