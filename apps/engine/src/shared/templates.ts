export interface Template {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  githubUrl?: string;
  isOfficial: boolean;
  isExperimental?: boolean;
  requiresNeon?: boolean;
}

// API Template interface from the external API
export interface ApiTemplate {
  githubOrg: string;
  githubRepo: string;
  title: string;
  description: string;
  imageUrl: string;
}

// Caide builds Flutter apps only. The default template must always be the
// Flutter app template; React/web templates are legacy and never the default.
export const DEFAULT_TEMPLATE_ID = "flutter";
export const DEFAULT_TEMPLATE: Template = {
  id: "flutter",
  title: "Flutter App Template",
  description:
    "Cross-platform Flutter app (Android, iOS, Web) with Material 3, ready for caide.",
  imageUrl:
    "https://github.com/user-attachments/assets/5b700eab-b28c-498e-96de-8649b14c16d9",
  isOfficial: true,
};

const PORTAL_MINI_STORE_ID = "portal-mini-store";
export const NEON_TEMPLATE_IDS = new Set<string>([PORTAL_MINI_STORE_ID]);

export const WEB3_TEMPLATE_KEYWORDS = [
  "blockchain",
  "dapp",
  "web3",
  "crypto",
  "nft",
  "token",
  "solana",
  "ethereum",
  "polygon",
  "wallet",
  "smart contract",
  "defi",
  "multichain",
  "cross-chain",
  "solidity",
  "anchor",
  "metaplex",
  "spl token",
  "erc-20",
  "erc-721",
  "erc-1155",
];

export const NEXTJS_TEMPLATE_KEYWORDS = [
  "nextjs",
  "next.js",
  "next",
  "ssr",
  "server side rendering",
];

export const FULLSTACK_TEMPLATE_KEYWORDS = [
  "backend",
  "fullstack",
  "full-stack",
  "server",
  "database",
  "api routes",
  "nitro",
  "express",
  "fastapi",
  "api endpoint",
];

export const localTemplatesData: Template[] = [
  DEFAULT_TEMPLATE,
  {
    id: "web3",
    title: "Multi-Chain Web3 dApp",
    description:
      "Multi-chain dApp with Solana + EVM support, wallet adapters, Anchor and Hardhat contract tooling.",
    imageUrl:
      "https://github.com/user-attachments/assets/5b700eab-b28c-498e-96de-8649b14c16d9",
    isOfficial: true,
    isExperimental: true,
  },
  {
    id: "next",
    title: "Next.js Template",
    description: "Uses Next.js, React.js, Shadcn, Tailwind and TypeScript.",
    imageUrl:
      "https://github.com/user-attachments/assets/96258e4f-abce-4910-a62a-a9dff77965f2",
    githubUrl: "https://github.com/dyad-sh/nextjs-template",
    isOfficial: true,
  },
  {
    id: "react-vite-nitro",
    title: "Fullstack Vite+Nitro Template",
    description:
      "Full-stack React + Vite + Nitro backend with Shadcn, Tailwind, TypeScript.",
    imageUrl:
      "https://github.com/user-attachments/assets/5b700eab-b28c-498e-96de-8649b14c16d9",
    githubUrl: "https://github.com/dyad-sh/react-vite-nitro",
    isOfficial: true,
    isExperimental: true,
  },
  {
    id: PORTAL_MINI_STORE_ID,
    title: "Portal: Mini Store Template",
    description: "Uses Neon DB, Payload CMS, Next.js",
    imageUrl:
      "https://github.com/user-attachments/assets/ed86f322-40bf-4fd5-81dc-3b1d8a16e12b",
    githubUrl: "https://github.com/dyad-sh/portal-mini-store-template",
    isOfficial: true,
    isExperimental: true,
    requiresNeon: true,
  },
];
