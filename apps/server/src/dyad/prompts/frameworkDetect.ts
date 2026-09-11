// FILE: frameworkDetect.ts
// Purpose: Framework detection from workspace files (pure fs, testable).
// Extracted as a leaf module so both the turn context and the blueprint
// tool can use it without an import cycle.

import { normalizeCaideFramework, type CaideFramework } from "./framework.ts";

/** Framework detection from workspace files (pure fs, testable). */
export async function detectFrameworkFromDisk(appPath: string): Promise<CaideFramework | undefined> {  const fs = await import("node:fs");
  try {
    const raw = fs.readFileSync(`${appPath}/.caide/framework.json`, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fw = normalizeCaideFramework(String(parsed.framework ?? "").toLowerCase());
    if (fw) return fw;
  } catch {
    // fall through to heuristics
  }
  try {
    if (fs.existsSync(`${appPath}/pubspec.yaml`)) return "flutter";
    const pkgRaw = fs.readFileSync(`${appPath}/package.json`, "utf8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, unknown>),
      ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
    };
    if (deps.expo || deps["react-native"] || deps["expo-status-bar"]) return "react-native";
    return "website";
  } catch {
    return undefined;
  }
}

const WEB3_DEP_KEYS = [
  "wagmi", "viem", "ethers", "web3", "@solana/web3.js", "@solana/wallet-adapter-react",
  "@mysten/sui", "aptos", "@web3modal/wagmi", "@rainbow-me/rainbowkit",
];

const WEB3_PUBSPEC_KEYS = [
  "web3dart",
  "flutter_web3",
  "walletconnect_dart",
  "web3modal_flutter",
  "reown_appkit",
  "solana",
];

const WEB3_LIB_KEYWORDS = ["web3dart", "walletconnect", "web3modal", "wallet_adapter", "useWallet", "useAccount"];

/** Multi-chain dApp detection: src/caide-web3/ tree, JS wallet/chain deps,
 * or Flutter (pubspec web3 packages / lib/ wallet code). Pure fs, testable. */
export async function detectWeb3App(appPath: string): Promise<boolean> {
  const fs = await import("node:fs");
  try {
    if (fs.existsSync(`${appPath}/src/caide-web3`)) return true;
    try {
      const pubspec = fs.readFileSync(`${appPath}/pubspec.yaml`, "utf8");
      if (WEB3_PUBSPEC_KEYS.some((k) => pubspec.includes(k))) return true;
    } catch {
      // no pubspec — not Flutter or unreadable
    }
    if (fs.existsSync(`${appPath}/lib`)) {
      const hits = scanDirKeywords(`${appPath}/lib`, WEB3_LIB_KEYWORDS, fs, 0);
      if (hits) return true;
    }
    const pkgRaw = fs.readFileSync(`${appPath}/package.json`, "utf8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, unknown>),
      ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
    };
    return WEB3_DEP_KEYS.some((k) => deps[k] !== undefined);
  } catch {
    return false;
  }
}

/** Bounded head read (32KB) — generated Dart files can be huge; wallet
 * imports live at the top. Returns null when unreadable. */
function readChunkHead(full: string, fs: typeof import("node:fs")): string | null {
  try {
    const fd = fs.openSync(full, "r");
    try {
      const buf = Buffer.alloc(32_768);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.subarray(0, n).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function scanDirKeywords(
  dir: string,
  keywords: string[],
  fs: typeof import("node:fs"),
  depth: number,
): boolean {  if (depth > 4) return false;
  let entries: import("node:fs").Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (scanDirKeywords(full, keywords, fs, depth + 1)) return true;
    } else if (/\.dart$/.test(entry.name)) {
      try {
        const text = readChunkHead(full, fs);
        if (text !== null && keywords.some((k) => text.includes(k))) return true;
      } catch {
        // unreadable file — skip
      }
    }
  }
  return false;
}
