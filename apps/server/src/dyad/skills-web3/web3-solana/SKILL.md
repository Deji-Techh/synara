---
name: web3-solana
description: Solana development with Anchor framework, PDA accounts, CPI, SPL Token/Token-2022, and Solana-specific security patterns. Activate when building on Solana SVM.
context: inline
---

# Solana Development Guide

## Programming Model

- Solana uses a Proof-of-History (PoH) consensus with parallel transaction execution.
- Programs (smart contracts) are stateless; all state is stored in PDA (Program Derived Address) accounts.
- Transactions are atomic bundles of instructions that can call multiple programs.

## Anchor Framework (Recommended)

- `#[program]` — declare program module
- `#[derive(Accounts)]` — validate account structs
- `Account<'info, T>` — typed account with auto owner/type validation
- `Signer<'info>` — verifies account signed the transaction
- `Program<'info, T>` — validates program ID for CPI
- `init` + `seeds` + `bump` — create PDA accounts
- `has_one = authority` — ownership relationship
- `close = destination` — secure account closure (refunds rent)

## PDA (Program Derived Address)

- Derived from `seeds` + `program_id` using `findProgramAddress`
- PDAs can sign CPIs via `invoke_signed` — no private key needed
- Always use canonical bump (from `findProgramAddress`), never accept from user
- Store bump in account state for validation

## CPI (Cross-Program Invocation)

- Use `Program<'info, T>` for CPI targets (auto-validates program ID)
- PDA signs via `seeds = &[b"seed", &[bump]]`
- Follow Checks-Effects-Interactions pattern

## Token Standards

- **SPL Token**: Standard token program, most compatible
- **Token-2022**: Transfer fees, transfer hooks, metadata pointers, confidential transfers, interest-bearing, non-transferable, pausable
- Use `anchor_spl::token::transfer` for SPL
- Use `Interface<'info, TokenInterface>` for dual SPL/Token-2022 support

## Solana Security (Non-Negotiable)

- Never use `init_if_needed` (reinit attack vector)
- Always validate account owner before deserializing
- Always check `is_signer` on authority accounts
- Validate program ID before every CPI
- Use canonical PDA bumps only
- Check oracle price freshness and confidence intervals
- Reject same-slot interactions (flash loan prevention)
- Emergency pause mechanism for DeFi protocols
