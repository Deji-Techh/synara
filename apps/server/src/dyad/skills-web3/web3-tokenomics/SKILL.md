---
name: web3-tokenomics
description: Token creation, launch mechanisms (Pump.fun, Raydium, Uniswap), tokenomics distribution, vesting, airdrops, and anti-rug patterns for SPL and ERC-20 tokens.
context: inline
---

# Tokenomics & Launch Guide

## Token Creation

- **Solana (SPL Token)**: Use `spl-token` CLI or `@solana/spl-token` library
- **Solana (Token-2022)**: Extended program for advanced features
- **EVM (ERC-20)**: OpenZeppelin `ERC20.sol` with customizable parameters
- **EVM (ERC-20 with features)**: Burnable, Capped, Pausable, Snapshot extensions

## Launch Mechanisms

| Method        | Use Case                                           |
| ------------- | -------------------------------------------------- |
| Direct Mint   | Utility/governance tokens, full supply control     |
| Pump.fun      | Community memecoins, bonding curve, auto-liquidity |
| Raydium LP    | Immediate DEX listing on Solana                    |
| Uniswap V2/V3 | Immediate DEX listing on EVM chains                |
| Bonding Curve | Gradual price discovery, continuous liquidity      |

## Tokenomics Distribution

- Team/Founders: 10-20% (with vesting, 12mo cliff + 24mo linear)
- Treasury/Ops: 15-25%
- Community/Airdrop: 20-40%
- Liquidity: 10-20%
- Investors: 5-15%
- Ecosystem Grants: 5-15%

## Anti-Rug Patterns

1. Lock team tokens in vesting contracts
2. Lock/burn LP tokens (minimum 6 months)
3. Publish all allocation wallet addresses
4. Use multisig for treasury (Squads V4, 3/5 minimum)
5. Revoke mint authority after total supply is minted
6. Revoke freeze authority if never needed

## Vesting

- Contract with start time, cliff duration, total duration
- Linear or step-wise unlocking
- Claimable = total \* elapsed / total_duration - already_released
- Support cancellation (only before cliff)

## Airdrop

- Merkle tree-based for gas efficiency
- Snapshot at a specific block/slot
- Claim period with expiry
- Unclaimed tokens go back to treasury
