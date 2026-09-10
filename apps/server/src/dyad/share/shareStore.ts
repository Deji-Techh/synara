// FILE: shareStore.ts
// Purpose: Time-boxed local share grants (item 38, first slice). Token →
// { appDir, relPath, expiresAtMs, note } persisted as JSON under the Caide
// home dir (same convention as dyad-providers.json). The HTTP route serves
// granted files; expiry is enforced on resolve with opportunistic pruning.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ShareGrant {
  token: string;
  appDir: string;
  relPath: string;
  note?: string;
  createdAt: number;
  expiresAtMs: number;
}

export const SHARE_TTL_MIN_DAYS = 1;
export const SHARE_TTL_MAX_DAYS = 30;
export const SHARE_TTL_DEFAULT_DAYS = 7;

export function defaultSharesPath(home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide")): string {
  // Test seam: an explicit file path isolates suites from the real home dir.
  const override = process.env.CAIDE_SHARES_PATH?.trim();
  if (override) return override;
  return path.join(home, "shares.json");
}

function readAll(filePath: string): Record<string, ShareGrant> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, ShareGrant>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // missing or corrupt — start empty
  }
  return {};
}

function writeAll(filePath: string, grants: Record<string, ShareGrant>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(grants, null, 2), { mode: 0o600 });
}

const memCache = new Map<string, { grants: Record<string, ShareGrant>; filePath: string }>();

function storeFor(filePath?: string): { grants: Record<string, ShareGrant>; filePath: string } {
  const fp = filePath ?? defaultSharesPath();
  const cached = memCache.get(fp);
  if (cached) return cached;
  const entry = { grants: readAll(fp), filePath: fp };
  memCache.set(fp, entry);
  return entry;
}

/** Test seam: drop cached state so file overrides take effect. */
export function resetShareStores(): void {
  memCache.clear();
}

function prune(store: { grants: Record<string, ShareGrant>; filePath: string }, nowMs = Date.now()): boolean {
  let changed = false;
  for (const [token, grant] of Object.entries(store.grants)) {
    if (grant.expiresAtMs <= nowMs) {
      delete store.grants[token];
      changed = true;
    }
  }
  if (changed) {
    try {
      writeAll(store.filePath, store.grants);
    } catch {
      // prune is best-effort
    }
  }
  return changed;
}

export function mintShareGrant(
  appDir: string,
  relPath: string,
  options: { expiresInDays?: number; note?: string; filePath?: string; nowMs?: number } = {},
): ShareGrant {
  const store = storeFor(options.filePath);
  const nowMs = options.nowMs ?? Date.now();
  prune(store, nowMs);
  const days = Math.min(
    SHARE_TTL_MAX_DAYS,
    Math.max(SHARE_TTL_MIN_DAYS, Math.floor(options.expiresInDays ?? SHARE_TTL_DEFAULT_DAYS)),
  );
  const grant: ShareGrant = {
    token: crypto.randomBytes(16).toString("hex"),
    appDir,
    relPath,
    ...(options.note?.trim() ? { note: options.note.trim().slice(0, 200) } : {}),
    createdAt: nowMs,
    expiresAtMs: nowMs + days * 86_400_000,
  };
  store.grants[grant.token] = grant;
  writeAll(store.filePath, store.grants);
  return grant;
}

export function resolveShareGrant(
  token: string,
  options: { filePath?: string; nowMs?: number } = {},
): ShareGrant | null {
  const store = storeFor(options.filePath);
  const nowMs = options.nowMs ?? Date.now();
  prune(store, nowMs);
  const grant = store.grants[token.trim()] ?? null;
  if (!grant || grant.expiresAtMs <= nowMs) return null;
  return grant;
}

export function revokeShareGrant(token: string, filePath?: string): boolean {
  const store = storeFor(filePath);
  if (!store.grants[token.trim()]) return false;
  delete store.grants[token.trim()];
  writeAll(store.filePath, store.grants);
  return true;
}

export function listShareGrants(appDir?: string, filePath?: string): ShareGrant[] {
  const store = storeFor(filePath);
  prune(store);
  const all = Object.values(store.grants).sort((a, b) => b.createdAt - a.createdAt);
  return appDir ? all.filter((g) => g.appDir === appDir) : all;
}
