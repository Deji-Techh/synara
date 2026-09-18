// FILE: publishStore.ts
// Purpose: Per-app publish links (item: Phase 4). <app>/.caide/publish.json
// (0600) carries github/vercel/coolify link state across chats — same
// pattern as db-link.json. No secrets on disk (PATs live in the encrypted
// server secrets file or the user's gh CLI auth).

import * as fs from "node:fs";
import * as path from "node:path";

export interface GithubPublishLink {
  org?: string;
  repo: string;
  branch?: string;
}

export interface VercelPublishLink {
  projectId: string;
  projectName?: string;
  teamId?: string;
  deploymentUrl?: string;
}

export interface CoolifyPublishLink {
  instanceUrl?: string;
  serverUuid?: string;
  projectUuid?: string;
  environment?: string;
  domain?: string;
  applicationUuid?: string;
}

export interface PublishLinks {
  github?: GithubPublishLink;
  vercel?: VercelPublishLink;
  coolify?: CoolifyPublishLink;
}

function publishFile(appPath: string): string {
  return path.join(appPath, ".caide", "publish.json");
}

const publishCache = new Map<string, PublishLinks>();

export function readPublishLinks(appPath: string): PublishLinks {
  const cached = publishCache.get(appPath);
  if (cached) return cached;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(publishFile(appPath), "utf8"),
    ) as Partial<PublishLinks>;
    const links: PublishLinks = {};
    if (parsed.github?.repo)
      links.github = {
        org: parsed.github.org,
        repo: parsed.github.repo,
        branch: parsed.github.branch,
      };
    if (parsed.vercel?.projectId) {
      links.vercel = {
        projectId: parsed.vercel.projectId,
        projectName: parsed.vercel.projectName,
        teamId: parsed.vercel.teamId,
        deploymentUrl: parsed.vercel.deploymentUrl,
      };
    }
    if (
      parsed.coolify &&
      (parsed.coolify.projectUuid || parsed.coolify.applicationUuid || parsed.coolify.instanceUrl)
    ) {
      links.coolify = { ...parsed.coolify };
    }
    publishCache.set(appPath, links);
    return links;
  } catch {
    return {};
  }
}

export type PublishPatch = {
  [K in keyof PublishLinks]?: PublishLinks[K] | null;
};

export function writePublishLinks(appPath: string, patch: PublishPatch): PublishLinks {
  const next: PublishLinks = { ...readPublishLinks(appPath) };
  (Object.keys(patch) as (keyof PublishLinks)[]).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    if (value === null) {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  publishCache.set(appPath, next);
  try {
    fs.mkdirSync(path.join(appPath, ".caide"), { recursive: true });
    fs.writeFileSync(publishFile(appPath), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(publishFile(appPath), 0o600);
    } catch {
      // non-POSIX — best effort
    }
  } catch {
    // disk write failed — in-memory links still apply for this process
  }
  return next;
}

/** Test-only: drop the memory cache (disk files untouched). */
export function clearPublishCache(): void {
  publishCache.clear();
}
