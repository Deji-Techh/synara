const solanaSkill = `---
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

- \`#[program]\` — declare program module
- \`#[derive(Accounts)]\` — validate account structs
- \`Account<'info, T>\` — typed account with auto owner/type validation
- \`Signer<'info>\` — verifies account signed the transaction
- \`Program<'info, T>\` — validates program ID for CPI
- \`init\` + \`seeds\` + \`bump\` — create PDA accounts
- \`has_one = authority\` — ownership relationship
- \`close = destination\` — secure account closure (refunds rent)

## PDA (Program Derived Address)

- Derived from \`seeds\` + \`program_id\` using \`findProgramAddress\`
- PDAs can sign CPIs via \`invoke_signed\` — no private key needed
- Always use canonical bump (from \`findProgramAddress\`), never accept from user
- Store bump in account state for validation

## CPI (Cross-Program Invocation)

- Use \`Program<'info, T>\` for CPI targets (auto-validates program ID)
- PDA signs via \`seeds = &[b"seed", &[bump]]\`
- Follow Checks-Effects-Interactions pattern

## Token Standards

- **SPL Token**: Standard token program, most compatible
- **Token-2022**: Transfer fees, transfer hooks, metadata pointers, confidential transfers, interest-bearing, non-transferable, pausable
- Use \`anchor_spl::token::transfer\` for SPL
- Use \`Interface<'info, TokenInterface>\` for dual SPL/Token-2022 support

## Solana Security (Non-Negotiable)

- Never use \`init_if_needed\` (reinit attack vector)
- Always validate account owner before deserializing
- Always check \`is_signer\` on authority accounts
- Validate program ID before every CPI
- Use canonical PDA bumps only
- Check oracle price freshness and confidence intervals
- Reject same-slot interactions (flash loan prevention)
- Emergency pause mechanism for DeFi protocols
`;
const evmSkill = `---
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
- Use OpenZeppelin \`ReentrancyGuard\` for external-facing functions
- Solidity >=0.8 has built-in overflow checking
- Use \`calldata\` (not \`memory\`) for function arguments
- Pack storage variables to save gas (\`uint128 + uint128\` in one slot)

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
- Never use \`tx.origin\` for authentication (use \`msg.sender\`)
- Always check return values of external calls
- No \`delegatecall\` to untrusted contracts
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
`;
const walletSkill = `---
name: web3-wallet
description: Multi-chain wallet connection using wagmi for EVM and @solana/wallet-adapter for Solana. Covers connection, disconnection, signing, and chain switching.
context: inline
---

# Multi-Chain Wallet Connection Guide

## EVM Wallet Connection (wagmi)

- \`useAccount()\` — connected address, chain ID, connection status
- \`useConnect()\` — available connectors (MetaMask, WalletConnect, Coinbase)
- \`useDisconnect()\` — disconnect wallet
- \`useBalance()\` — native token balance
- \`useSendTransaction()\` — send transactions
- \`useSignMessage()\` — sign messages for authentication
- \`useSwitchChain()\` — switch networks

## Solana Wallet Connection

- \`useWallet()\` — connected public key, wallet adapter, connection status
- \`useConnection()\` — RPC connection object
- \`@solana/wallet-adapter-react\` provides React context
- \`@solana/wallet-adapter-wallets\` provides wallet implementations
- Supported wallets: Phantom, Solflare, Backpack, Glow, etc.

## Multi-Chain Architecture

- Keep connection state separate per chain ecosystem
- Detect chain type from address format:
  - EVM: \`0x\` prefix, 42 chars
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
`;
const multichainSkill = `---
name: web3-multichain
description: Multi-chain architecture for chain abstraction, network management, chain detection, and cross-chain considerations. Activate when the dApp supports multiple blockchains.
context: inline
---

# Multi-Chain Architecture Guide

## Chain Abstraction

- Abstract chain interactions behind an interface:
  - \`getBalance(address, chainId)\` -> native balance
  - \`sendTransaction(tx, chainId)\` -> tx hash
  - \`readContract(address, abi, functionName, args, chainId)\` -> result
- Implement for each supported chain ecosystem
- Use environment-aware config for RPC endpoints

## Network Management

- Read available networks from \`caide-networks.json\` (if present)
- Fall back to hardcoded defaults
- Validate RPC URLs before use
- Handle network switching gracefully
- Show connected network prominently in UI

## Chain Detection

- Read \`window.ethereum\` for EVM
- Read \`window.solana\` / \`window.phantom\` for Solana
- Detect when user has no wallet installed → show install prompts
- Support WalletConnect for mobile wallets

## Cross-Chain Considerations

- Address formats differ per chain (do not share addresses across chains)
- Transaction fees paid in native token of each chain
- Block times differ (Solana ~400ms, Ethereum ~12s)
- Confirmation requirements differ
`;
const defiSkill = `---
name: web3-defi
description: DeFi protocol development covering AMMs, lending, vaults, staking, oracle integration, and DeFi-specific security. Activate when building DeFi primitives.
context: inline
---

# DeFi Protocol Development Guide

## AMM (Automated Market Maker)

- **Constant Product**: \`x * y = k\`
- Output = \`(y * input) / (x + input)\`
- Fee = \`input * fee_bps / 10000\`
- **Concentrated Liquidity**: Liquidity within price ranges (like Uniswap V3 / Orca Whirlpools)
- Slippage protection via \`minimum_out\` parameter

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
- \`shares_to_mint = deposit * total_shares / total_underlying\`
- \`underlying_to_return = shares_to_burn * total_underlying / total_shares\`
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
- Admin keys behind multisig for >\$10k TVL
- Slippage protection on every swap/liquidity operation
`;
const nftSkill = `---
name: web3-nft
description: NFT and digital asset development covering ERC-721/1155, Solana Metaplex, Bubblegum compressed NFTs, IPFS/Arweave storage, and marketplace patterns.
context: inline
---

# NFTs & Digital Assets Guide

## EVM NFTs

- **ERC-721**: Standard NFTs (OpenZeppelin implementation)
- **ERC-1155**: Multi-token (ERC-20 + ERC-721 combined)
- Metadata typically stored on IPFS
- Royalties via EIP-2981 standard
- Marketplace integration (OpenSea, Blur)

## Solana NFTs (Metaplex)

- **Metaplex Token Metadata**: Attach metadata to SPL tokens
- \`createV1(umi, { mint, name, symbol, uri })\` to create
- UMI framework for Metaplex interactions
- **Metaplex Core**: New standard, simpler than Token Metadata
- **Bubblegum**: Compressed NFTs (cheap minting at scale)

## Storage

- **IPFS**: Decentralized storage via Pinata, web3.storage, NFT.Storage
- **Arweave**: Permanent storage via Bundlr
- Store metadata JSON on-chain URIs pointing to off-chain content
- Use deterministic URIs (content-addressed)

## NFT Marketplace

- Listing: Seller creates a sell order
- Buying: Buyer fulfills the sell order
- Auction: Bidding with time-based settlement
- Royalties: Deduct from sale price to original creator
- Marketplace fee: Small percentage of each sale

## Best Practices

- Verify ownership before allowing transfers
- Validate metadata URIs (must point to valid JSON)
- Handle IPFS gateway failures with fallback URLs
- Show loading states during IPFS fetches
- Cache metadata after first fetch
`;
const tokenomicsSkill = `---
name: web3-tokenomics
description: Token creation, launch mechanisms (Pump.fun, Raydium, Uniswap), tokenomics distribution, vesting, airdrops, and anti-rug patterns for SPL and ERC-20 tokens.
context: inline
---

# Tokenomics & Launch Guide

## Token Creation

- **Solana (SPL Token)**: Use \`spl-token\` CLI or \`@solana/spl-token\` library
- **Solana (Token-2022)**: Extended program for advanced features
- **EVM (ERC-20)**: OpenZeppelin \`ERC20.sol\` with customizable parameters
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
- Claimable = total \\* elapsed / total_duration - already_released
- Support cancellation (only before cliff)

## Airdrop

- Merkle tree-based for gas efficiency
- Snapshot at a specific block/slot
- Claim period with expiry
- Unclaimed tokens go back to treasury
`;
const crosschainSkill = `---
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
- \`wormhole_sdk\` for integration

## LayerZero (EVM ↔ EVM)

- Omnichain messaging protocol
- Ultra Light Node (ULN) for gas efficiency
- \`@layerzerolabs/lz-v2\` SDK

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
`;
const securitySkill = `---
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
- Never trust \`msg.sender\`/\`tx.origin\` without validation

## Solana-Specific Vulnerabilities

### Critical

1. **Arbitrary CPI**: User-controlled program ID in \`invoke()\` calls. Always validate \`program.key() == EXPECTED_PROGRAM_ID\`
2. **Improper PDA Validation**: Never use \`createProgramAddress\` with user-provided bumps. Use \`findProgramAddress\` for canonical bump
3. **Missing Signer Check**: Always verify \`account.is_signer\` on authority accounts

### High

4. **Missing Ownership Check**: Validate \`account.owner\` before deserializing
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
- Admin keys behind multisig (>\$10k TVL)
- Oracle freshness + confidence validation
- Formal verification for invariant-critical paths

## Testing Requirements

- Unit tests for every instruction
- Integration tests with forked mainnet
- Fuzz testing (Trident for Solana, Echidna for EVM)
- Static analysis (Slither for EVM)
- Economic attack scenario testing
`;
import {
  stripFrontmatter,
  parseFrontmatter,
  type SkillFrontmatter,
} from "./skill_frontmatter";

export const WEB3_SKILL_FRONTMATTERS: Record<string, SkillFrontmatter> = {
  "web3-solana": parseFrontmatter(solanaSkill).frontmatter,
  "web3-evm": parseFrontmatter(evmSkill).frontmatter,
  "web3-wallet": parseFrontmatter(walletSkill).frontmatter,
  "web3-multichain": parseFrontmatter(multichainSkill).frontmatter,
  "web3-defi": parseFrontmatter(defiSkill).frontmatter,
  "web3-nft": parseFrontmatter(nftSkill).frontmatter,
  "web3-tokenomics": parseFrontmatter(tokenomicsSkill).frontmatter,
  "web3-crosschain": parseFrontmatter(crosschainSkill).frontmatter,
  "web3-security": parseFrontmatter(securitySkill).frontmatter,
};

const modules = [
  { name: "Solana Development", content: solanaSkill },
  { name: "EVM Development", content: evmSkill },
  { name: "Multi-Chain Wallet", content: walletSkill },
  { name: "Multi-Chain Architecture", content: multichainSkill },
  { name: "DeFi Protocols", content: defiSkill },
  { name: "NFTs & Digital Assets", content: nftSkill },
  { name: "Tokenomics & Launch", content: tokenomicsSkill },
  { name: "Cross-Chain", content: crosschainSkill },
  { name: "Security", content: securitySkill },
];

const modulesBlock = modules
  .map(
    (m) =>
      `<web3-module name="${m.name}">\n${stripFrontmatter(m.content)}\n</web3-module>`,
  )
  .join("\n\n");

export const WEB3_SKILL_PACK = `
<web3-development>
The following web3 development modules are enabled for this multi-chain dApp. Follow them as authoritative reference when building blockchain features.

${modulesBlock}

## General Multi-Chain Rules
- Always handle wallet disconnection gracefully
- Show loading states during blockchain operations
- Validate addresses before sending transactions
- Use try/catch around all blockchain RPC calls
- Never expose private keys, seed phrases, or API keys
- Prefer the pre-built components in src/caide-web3/ when adding wallet connection features
</web3-development>
`.trim();
