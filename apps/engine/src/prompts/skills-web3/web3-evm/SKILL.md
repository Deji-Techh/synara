---
name: web3-evm
description: EVM development with Solidity, Hardhat, OpenZeppelin, ERC standards, and EVM-specific security patterns. Activate when building on Ethereum or EVM-compatible chains.
context: inline
---

# EVM Development Guide

## Programming Model

- Smart contracts on EVM chains (Ethereum, Polygon, Base, Arbitrum, Optimism)
- Solidity is the primary language
- State persisted in contract storage (SLOAD/SSTORE)
- Transactions are sequential per-contract

## Solidity Patterns

- **Checks-Effects-Interactions**: Validate → Update state → External calls last
- Use OpenZeppelin `ReentrancyGuard` for external-facing functions
- Solidity >=0.8 has built-in overflow checking
- Use `calldata` (not `memory`) for function arguments
- Pack storage variables to save gas (`uint128 + uint128` in one slot)

## Common Contract Types

- **ERC-20**: Fungible tokens (OpenZeppelin implementation)
- **ERC-721**: Non-fungible tokens (NFTs)
- **ERC-1155**: Multi-token (fungible + non-fungible)
- **ERC-4626**: Tokenized Vaults

## Hardhat (Recommended for EVM)

- Hardhat for compilation, testing, and deployment
- Hardhat Ignition for declarative deployments
- Waffle/Ethers for testing with chai matchers
- Hardhat Network for local forking

## EVM Security (Non-Negotiable)

- Reentrancy: CEI pattern or ReentrancyGuard
- Never use `tx.origin` for authentication (use `msg.sender`)
- Always check return values of external calls
- No `delegatecall` to untrusted contracts
- Pin Solidity version (no floating pragma)
- Emit events for all state changes
- Use Pull over Push payment pattern
- Add deadline parameters to prevent stale transactions
- Use OpenZeppelin's Ownable or AccessControl for permissions

## Tools

- Slither — static analysis
- Echidna — fuzzing
- Foundry — fast compilation and fuzz testing
- Hardhat — development environment
