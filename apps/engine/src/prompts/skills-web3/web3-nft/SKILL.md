---
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
- `createV1(umi, { mint, name, symbol, uri })` to create
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
