import { stripFrontmatter, parseFrontmatter, type SkillFrontmatter } from "./skill_frontmatter";
import { rawAsset } from "@/raw-assets";
const solanaSkill = rawAsset("src/prompts/skills-web3/web3-solana/SKILL.md");
const evmSkill = rawAsset("src/prompts/skills-web3/web3-evm/SKILL.md");
const walletSkill = rawAsset("src/prompts/skills-web3/web3-wallet/SKILL.md");
const multichainSkill = rawAsset("src/prompts/skills-web3/web3-multichain/SKILL.md");
const defiSkill = rawAsset("src/prompts/skills-web3/web3-defi/SKILL.md");
const nftSkill = rawAsset("src/prompts/skills-web3/web3-nft/SKILL.md");
const tokenomicsSkill = rawAsset("src/prompts/skills-web3/web3-tokenomics/SKILL.md");
const crosschainSkill = rawAsset("src/prompts/skills-web3/web3-crosschain/SKILL.md");
const securitySkill = rawAsset("src/prompts/skills-web3/web3-security/SKILL.md");

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
  .map((m) => `<web3-module name="${m.name}">\n${stripFrontmatter(m.content)}\n</web3-module>`)
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
