---
name: web3-crosschain
description: Cross-chain bridge patterns (lock-mint, burn-release, atomic swaps), Wormhole and LayerZero integration, chain abstraction, and cross-chain best practices.
context: inline
---

# Cross-Chain Development Guide

## Bridge Patterns

- **Lock & Mint**: Lock tokens on source chain, mint wrapped tokens on destination
- **Burn & Release**: Burn wrapped tokens on destination, release native on source
- **Atomic Swaps**: HTLC-based trustless swaps between chains
- **Message Passing**: General message relay (Wormhole, LayerZero)

## Wormhole (Solana ↔ EVM)

- Generic message passing protocol
- VAAs (Verified Action Approvals) as proof
- Guardians validate messages
- `wormhole_sdk` for integration

## LayerZero (EVM ↔ EVM)

- Omnichain messaging protocol
- Ultra Light Node (ULN) for gas efficiency
- `@layerzerolabs/lz-v2` SDK

## Chain Abstraction

- Use cross-chain naming for assets (wSOL, WETH, USDC)
- Normalize decimals per chain (Solana 9, EVM 18 typical)
- Handle different block times and finality
- Manage address formatting differences

## Best Practices

- Validate emitter address on destination (prevent fake messages)
- Use relayer networks for destination delivery
- Handle reorgs safely (wait for sufficient confirmations)
- Keep cross-chain messages idempotent
- Monitor for bridge exploit patterns
