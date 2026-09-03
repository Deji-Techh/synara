---
name: web3-defi
description: DeFi protocol development covering AMMs, lending, vaults, staking, oracle integration, and DeFi-specific security. Activate when building DeFi primitives.
context: inline
---

# DeFi Protocol Development Guide

## AMM (Automated Market Maker)

- **Constant Product**: `x * y = k`
- Output = `(y * input) / (x + input)`
- Fee = `input * fee_bps / 10000`
- **Concentrated Liquidity**: Liquidity within price ranges (like Uniswap V3 / Orca Whirlpools)
- Slippage protection via `minimum_out` parameter

## Lending Protocol

- **Interest Rate Model** (two-slope):
  - Utilization = total_borrows / total_deposits
  - Below optimal: low slope (encourage borrowing)
  - Above optimal: steep slope (discourage borrowing)
- Over-collateralized loans (typically 120-150% collateral ratio)
- Liquidation when health factor drops below threshold
- Oracle-based asset pricing (Pyth, Chainlink)

## Vault Pattern

- Users deposit assets, receive shares
- `shares_to_mint = deposit * total_shares / total_underlying`
- `underlying_to_return = shares_to_burn * total_underlying / total_shares`
- Shares represent proportional ownership

## Staking

- Users lock tokens to earn rewards
- Track rewards per token staked (accumulator pattern)
- Support unstaking with optional lock period
- Compounding rewards (auto or manual)

## Oracle Integration

- **Pyth Network**: Solana-native, pull-based, sub-second updates
- **Chainlink**: EVM-native, aggregation-based
- Validate: staleness (< max age), confidence interval, price > 0
- Use TWAP for liquidation decisions, not spot price

## DeFi Security

- All math must use checked arithmetic
- Round against the user (floor user output, ceil user input)
- Flash loan protection: track last interaction slot
- Emergency pause mechanism mandatory
- Admin keys behind multisig for >$10k TVL
- Slippage protection on every swap/liquidity operation
