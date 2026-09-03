// FILE: templates.ts
// Purpose: web3 + api template scaffolds. Template sources ship under
// dyad/scaffolds/{web3,api}-template (ported donor trees); these functions
// copy a tree into a fresh project root with the app name applied.
// Donor: dyad x caide scaffold-web3/ + scaffold-api/ (+ provision-backend
// guide flow, which the agent follows via read_guide).

import * as fs from "node:fs";
import * as path from "node:path";

const WEB3_TEMPLATE_DIR = new URL("./web3-template/", import.meta.url);
const API_TEMPLATE_DIR = new URL("./api-template/", import.meta.url);

const SKIP_NAMES = new Set(["node_modules", ".git", "dist", "build", ".DS_Store"]);

async function copyTree(srcDir: string, destRoot: string, created: string[]): Promise<void> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destRoot, entry.name);
    if (entry.isDirectory()) {
      await fs.promises.mkdir(dest, { recursive: true });
      await copyTree(src, dest, created);
    } else if (entry.isFile()) {
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(src, dest);
      created.push(path.relative(destRoot, dest));
    }
  }
}

function templateDir(url: URL): string {
  return url.protocol === "file:" ? new URL(url).pathname : process.cwd();
}

/** Scaffold a multi-chain web3 dApp (wagmi/viem + solana adapters). */
export async function scaffoldWeb3(root: string, appName = "CaideWeb3App"): Promise<string[]> {
  const created: string[] = [];
  await fs.promises.mkdir(root, { recursive: true });
  await copyTree(templateDir(WEB3_TEMPLATE_DIR), root, created);
  const pkgPath = path.join(root, "package.json");
  try {
    const pkg = JSON.parse(await fs.promises.readFile(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.name = appName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    await fs.promises.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  } catch {
    // template without package.json — nothing to rename
  }
  return created;
}

/** Scaffold a production API backend (express + zod + postgres). */
export async function scaffoldApi(root: string, appName = "CaideApi"): Promise<string[]> {
  const created: string[] = [];
  await fs.promises.mkdir(root, { recursive: true });
  await copyTree(templateDir(API_TEMPLATE_DIR), root, created);
  const pkgPath = path.join(root, "package.json");
  try {
    const pkg = JSON.parse(await fs.promises.readFile(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.name = appName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    await fs.promises.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  } catch {
    // template without package.json — nothing to rename
  }
  return created;
}
