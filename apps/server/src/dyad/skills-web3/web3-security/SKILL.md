---
name: web3-security
description: Web3 security covering Solana-specific vulnerabilities (arbitrary CPI, PDA validation, missing signer checks), EVM vulnerabilities (reentrancy, overflow, front-running), DeFi security, and testing requirements.
context: inline
---

# Web3 Security Guide

## Universal Security Rules

- Never hardcode private keys, seed phrases, or API keys in client code
- Never expose RPC URLs with API keys in frontend bundles
- Validate all user inputs (addresses, amounts, signatures)
- Use checksummed addresses (EIP-55) for EVM
- Never trust `msg.sender`/`tx.origin` without validation

## Solana-Specific Vulnerabilities

### Critical

1. **Arbitrary CPI**: User-controlled program ID in `invoke()` calls. Always validate `program.key() == EXPECTED_PROGRAM_ID`
2. **Improper PDA Validation**: Never use `createProgramAddress` with user-provided bumps. Use `findProgramAddress` for canonical bump
3. **Missing Signer Check**: Always verify `account.is_signer` on authority accounts

### High

4. **Missing Ownership Check**: Validate `account.owner` before deserializing
5. **Sysvar Check**: Use checked sysvar functions (prevent spoofing)

### Medium

6. **Improper Instruction Introspection**: Use relative indexing, validate correlation IDs

## EVM-Specific Vulnerabilities

- **Reentrancy**: CEI pattern or ReentrancyGuard
- **Integer Overflow**: Solidity >=0.8 safe, <0.8 use SafeMath
- **Front-Running**: Commit-reveal pattern, add deadlines
- **Flash Loan Attacks**: Validate state consistency after interactions
- **Oracle Manipulation**: Use TWAP, validate confidence/staleness
- **Access Control**: Use OpenZeppelin Ownable/AccessControl

## DeFi Security

- CEI pattern for all CPIs
- Round math against the user
- Flash loan protection: track per-slot interactions
- Slippage protection on every swap
- Emergency pause mechanism
- Admin keys behind multisig (>$10k TVL)
- Oracle freshness + confidence validation
- Formal verification for invariant-critical paths

## Testing Requirements

- Unit tests for every instruction
- Integration tests with forked mainnet
- Fuzz testing (Trident for Solana, Echidna for EVM)
- Static analysis (Slither for EVM)
- Economic attack scenario testing
