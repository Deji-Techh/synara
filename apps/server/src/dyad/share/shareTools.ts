// FILE: shareTools.ts
// Purpose: share_artifact / revoke_share / list_shares agent tools (item 38,
// first slice). Mint time-boxed download links for workspace files (builds,
// screenshots, evidence) on the existing share-grant store; an HTTP route
// serves granted files. Expiry enforced on resolve; comments and live
// preview tunneling follow in later slices.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import {
  listShareGrants,
  mintShareGrant,
  revokeShareGrant,
  SHARE_TTL_DEFAULT_DAYS,
  SHARE_TTL_MAX_DAYS,
  SHARE_TTL_MIN_DAYS,
} from "./shareStore.ts";

/** Absolute server origin for share links: explicit env override, then the
 * persisted runtime state the server writes at startup, else "" (relative). */
export function resolveShareBase(): string {
  const override = process.env.CAIDE_PUBLIC_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  const candidates = [
    path.join(home, "userdata", "server-runtime.json"),
    path.join(home, "dev", "server-runtime.json"),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { origin?: unknown };
      if (typeof parsed.origin === "string" && parsed.origin.trim()) {
        return parsed.origin.trim().replace(/\/+$/, "");
      }
    } catch {
      // try next candidate
    }
  }
  return "";
}

function resolveAppFile(appPath: string, relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return null;
  const full = path.resolve(appPath, normalized);
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile()) return null;
    if (stat.size > 500_000_000) return null;
    return full;
  } catch {
    return null;
  }
}

const shareArtifactSchema = z.object({
  path: z
    .string()
    .describe(
      "Workspace-relative file to share (e.g. .caide/media/hero.png, dist/app.apk, build/app.ipa, dist/index.html). Must exist under the app directory.",
    ),
  expiresInDays: z
    .number()
    .int()
    .min(SHARE_TTL_MIN_DAYS)
    .max(SHARE_TTL_MAX_DAYS)
    .optional()
    .describe(
      `Link lifetime in days, ${SHARE_TTL_MIN_DAYS}-${SHARE_TTL_MAX_DAYS} (default ${SHARE_TTL_DEFAULT_DAYS}).`,
    ),
  note: z
    .string()
    .optional()
    .describe("Short label shown alongside the link (e.g. 'beta APK', 'home screenshot')."),
});

export const shareArtifactTool = defineTool({
  name: "share_artifact",
  description: [
    "Mint a time-boxed download link for a workspace file (builds, screenshots, evidence).",
    "The file must exist under the app directory; links expire automatically (default 7 days, max 30).",
    "Use for handoff moments: after a build, a screenshot pass, or when the user asks to share something.",
    "Revoke early with revoke_share.",
  ].join(" "),
  schema: shareArtifactSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = shareArtifactSchema.parse(args);
    const full = resolveAppFile(ctx.appPath, parsed.path);
    if (!full) {
      throw new Error(
        `Cannot share "${parsed.path}": not a file under the app directory (max 500MB).`,
      );
    }
    const rel = path.relative(ctx.appPath, full).replace(/\\/g, "/");
    const grant = mintShareGrant(ctx.appPath, rel, {
      expiresInDays: parsed.expiresInDays,
      note: parsed.note,
    });
    const base = resolveShareBase();
    const url = `${base}/api/share?token=${grant.token}`;
    const days = Math.round((grant.expiresAtMs - grant.createdAt) / 86_400_000);
    return [
      `Share link minted (expires in ${days} day${days === 1 ? "" : "s"}): ${url}`,
      `Revoke early with revoke_share (${grant.token.slice(0, 8)}…).`,
    ].join("\n");
  },
  presentCall: (args: any) => `Share ${args.path ?? "artifact"}`,
});

const revokeShareSchema = z.object({
  token: z.string().describe("Share token (or its first 8 characters) to revoke."),
});

export const revokeShareTool = defineTool({
  name: "revoke_share",
  description:
    "Revoke a share link before its expiry. Accepts the full token or its first 8 characters.",
  schema: revokeShareSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args) => {
    const parsed = revokeShareSchema.parse(args);
    const needle = parsed.token.trim();
    if (!needle) throw new Error("Token is required.");
    if (revokeShareGrant(needle)) return "Share link revoked.";
    const match = listShareGrants().find((g) => g.token.startsWith(needle));
    if (match && revokeShareGrant(match.token)) return "Share link revoked.";
    throw new Error("No active share link matches that token.");
  },
  presentCall: () => "Revoke share link",
});

export const listSharesTool = defineTool({
  name: "list_shares",
  description: "List active share links for this app (token prefix, file, expiry, note).",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const grants = listShareGrants(ctx.appPath);
    if (grants.length === 0) return "No active share links for this app.";
    return grants
      .map(
        (g) =>
          `- ${g.token.slice(0, 8)}… ${g.relPath} (expires ${new Date(g.expiresAtMs).toISOString().slice(0, 10)}${g.note ? ` — ${g.note}` : ""})`,
      )
      .join("\n");
  },
  presentCall: () => "List share links",
});

export const ALL_SHARE_TOOLS: ToolDef[] = [shareArtifactTool, revokeShareTool, listSharesTool];
