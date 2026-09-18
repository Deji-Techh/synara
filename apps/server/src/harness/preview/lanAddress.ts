// FILE: lanAddress.ts
// Purpose: Picks the machine's LAN IPv4 address for mobile QR previews
// (phone on the same WiFi opens http://<lan-ip>:<port>).
// Donor pattern: dyad x caide network_handlers.ts selectNetworkAddress.
// Layer: harness preview helpers (pure, no I/O — pass networkInterfaces() in).

import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

const VIRTUAL_INTERFACE_PATTERN =
  /^(br-|docker|ham|lo|podman|tailscale|tap|tun|veth|virbr|vmnet|wg|zt)/i;

function addressScore(name: string, address: string): number {
  if (address.startsWith("169.254.")) return Number.NEGATIVE_INFINITY;

  let score = 200;
  if (address.startsWith("192.168.")) score = 500;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score = 450;
  else if (address.startsWith("10.")) score = 400;
  else if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) {
    score = 100;
  }

  if (/^(en|eth|wl|wlan)/i.test(name)) score += 50;
  if (VIRTUAL_INTERFACE_PATTERN.test(name)) score -= 1_000;
  return score;
}

export function selectLanAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string | null {
  const candidates: Array<{ address: string; score: number }> = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      candidates.push({
        address: address.address,
        score: addressScore(name, address.address),
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates.find((candidate) => Number.isFinite(candidate.score))?.address ?? null;
}

/** Live lookup: best LAN IPv4 or null (WiFi off / no network). */
export function getLanAddress(): string | null {
  try {
    return selectLanAddress(networkInterfaces());
  } catch {
    return null;
  }
}

/**
 * Rewrites a loopback/wildcard preview URL to its LAN equivalent,
 * preserving port, path, and query. Returns null when the URL is not
 * a rewritable local URL.
 */
export function toLanUrl(sessionUrl: string, lanIp: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(sessionUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  if (!["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) return null;
  parsed.hostname = lanIp;
  return parsed.toString();
}
