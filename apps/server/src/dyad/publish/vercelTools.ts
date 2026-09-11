// FILE: vercelTools.ts
// Purpose: Vercel publish agent tools (Phase 4b, PAT-first). Token from
// Settings → Integrations or VERCEL_TOKEN env. Project links persist to
// .caide/publish.json; env values are never logged.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { getVoiceApiKey } from "../../voice/transcriptionService.ts";
import { getDatabaseLink } from "../db/connections.ts";
import { detectFrameworkFromDisk } from "../prompts/frameworkDetect.ts";
import type { CaideFramework } from "../prompts/framework.ts";
import {
  createVercelProject,
  getVercelAuthUser,
  listVercelDeployments,
  listVercelProjects,
  NEON_VERCEL_ENV_KEYS,
  syncNeonEnvToVercel,
  triggerVercelDeployment,
} from "./vercelApi.ts";
import { readPublishLinks, writePublishLinks } from "./publishStore.ts";

export class VercelToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VercelToolError";
  }
}

/** PAT from stored settings key or env (Settings → Integrations, or VERCEL_TOKEN). */
export function getVercelToken(): string | null {
  return getVoiceApiKey("vercel");
}

function requireVercelToken(): string {
  const token = getVercelToken();
  if (!token) {
    throw new VercelToolError("Vercel token missing — add a personal token in Settings → Integrations.");
  }
  return token;
}

/**
 * Vercel hosts web frontends only (F0). Refuse React Native / Flutter /
 * blank apps with a redirect instead of creating a doomed project:
 * companion APIs go to Coolify, binaries via share_artifact.
 */
export async function requireWebsiteFramework(appPath: string): Promise<void> {
  let framework: CaideFramework | undefined;
  try {
    framework = await detectFrameworkFromDisk(appPath);
  } catch {
    framework = undefined;
  }
  if (framework && framework !== "website") {
    throw new VercelToolError(
      framework === "blank"
        ? "Vercel hosts websites — this is a Blank project with no UI to deploy. Create a Website project to use Vercel."
        : `Vercel hosts websites — this is a ${framework === "react-native" ? "React Native" : "Flutter"} app. Ship its companion API via Coolify, or share binaries with share_artifact.`,
    );
  }
}

const vercelConnectSchema = z.object({
  projectId: z.string().optional().describe("Existing Vercel project id to link. Omit to create one."),
  name: z.string().optional().describe("Name for a new project (defaults to the app directory name)."),
  teamId: z.string().optional().describe("Vercel team id (for team-scoped projects)."),
});

export const vercelConnectTool = defineTool({
  name: "vercel_connect",
  description: [
    "Connect the app to Vercel: link an existing project or create one. Requires a Vercel personal token",
    "(account settings → tokens). Persists the link to .caide/publish.json. Connect the project to a git",
    "repo (dashboard or our GitHub flow) before deploying.",
    "Website projects only — React Native, Flutter, and Blank apps are refused with alternatives.",
  ].join(" "),
  schema: vercelConnectSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = vercelConnectSchema.parse(args);
    await requireWebsiteFramework(ctx.appPath);
    const token = requireVercelToken();
    const user = await getVercelAuthUser({ token, signal: ctx.signal });
    let project;
    if (parsed.projectId?.trim()) {
      const projects = await listVercelProjects({ token, teamId: parsed.teamId, signal: ctx.signal });
      const found = projects.find((p) => p.id === parsed.projectId?.trim());
      if (!found) throw new VercelToolError(`Vercel project ${parsed.projectId} not found for this token.`);
      project = found;
    } else {
      const fallback = ctx.appPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "caide-app";
      project = await createVercelProject({
        token,
        name: parsed.name?.trim() || fallback,
        teamId: parsed.teamId,
        signal: ctx.signal,
      });
    }
    writePublishLinks(ctx.appPath, {
      vercel: {
        projectId: project.id,
        projectName: project.name,
        ...(parsed.teamId?.trim() ? { teamId: parsed.teamId.trim() } : {}),
      },
    });
    return `Vercel ${parsed.projectId ? "linked" : "project created and linked"}: ${project.name} (${project.id}) for ${user.username ?? user.email ?? user.id}. Connect it to a git repo, then deploy with vercel_deploy.`;
  },
  presentCall: () => "Connect Vercel project",
});

export const vercelDeployTool = defineTool({
  name: "vercel_deploy",
  description: [
    "Trigger a production deployment on the linked Vercel project. The project must be connected to a git",
    "repo (otherwise Vercel's error is surfaced — file-upload deploys are out of scope). Website projects only.",
  ].join(" "),
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    await requireWebsiteFramework(ctx.appPath);
    const token = requireVercelToken();
    const link = readPublishLinks(ctx.appPath).vercel;
    if (!link) throw new VercelToolError("No Vercel project linked — run vercel_connect first.");
    const deployment = await triggerVercelDeployment({
      token,
      projectId: link.projectId,
      projectName: link.projectName ?? link.projectId,
      teamId: link.teamId,
      signal: ctx.signal,
    });
    const url = deployment.url ? `https://${deployment.url}` : deployment.id;
    writePublishLinks(ctx.appPath, {
      vercel: { ...link, ...(deployment.url ? { deploymentUrl: url } : {}) },
    });
    return `Deployment triggered (${deployment.state ?? "started"}): ${url}. Check status with vercel_deployments.`;
  },
  presentCall: () => "Deploy to Vercel",
});

export const vercelDeploymentsTool = defineTool({
  name: "vercel_deployments",
  description: "List the latest Vercel deployments for the linked project with states and URLs.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const token = requireVercelToken();
    const link = readPublishLinks(ctx.appPath).vercel;
    if (!link) throw new VercelToolError("No Vercel project linked — run vercel_connect first.");
    const deployments = await listVercelDeployments({
      token,
      projectId: link.projectId,
      teamId: link.teamId,
      signal: ctx.signal,
    });
    if (deployments.length === 0) return "No deployments yet.";
    return deployments
      .map((d) => `- ${d.id} [${d.state ?? "?"}] ${d.target ?? ""} ${d.url ? `https://${d.url}` : ""}`.trim())
      .join("\n");
  },
  presentCall: () => "List Vercel deployments",
});

const vercelEnvSyncSchema = z.object({
  databaseUrl: z.string().optional().describe("DATABASE_URL value (else read from the linked Neon/database connection)."),
  neonAuthBaseUrl: z.string().optional(),
  neonAuthCookieSecret: z.string().optional(),
});

export const vercelEnvSyncTool = defineTool({
  name: "vercel_env_sync",
  description: [
    "Sync Neon-owned env vars (DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET) to the linked",
    "Vercel project across production/preview/development. Values are never logged. POSTGRES_URL is deliberately never synced.",
  ].join(" "),
  schema: vercelEnvSyncSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = vercelEnvSyncSchema.parse(args);
    const token = requireVercelToken();
    const link = readPublishLinks(ctx.appPath).vercel;
    if (!link) throw new VercelToolError("No Vercel project linked — run vercel_connect first.");
    const dbLink = getDatabaseLink(ctx.sessionId);
    const vars: Partial<Record<(typeof NEON_VERCEL_ENV_KEYS)[number], string>> = {
      ...(parsed.databaseUrl?.trim() ?? dbLink?.databaseUrl?.trim()
        ? { DATABASE_URL: (parsed.databaseUrl?.trim() || dbLink?.databaseUrl || "") as string }
        : {}),
      ...(parsed.neonAuthBaseUrl?.trim() ? { NEON_AUTH_BASE_URL: parsed.neonAuthBaseUrl.trim() } : {}),
      ...(parsed.neonAuthCookieSecret?.trim() ? { NEON_AUTH_COOKIE_SECRET: parsed.neonAuthCookieSecret.trim() } : {}),
    };
    if (Object.keys(vars).length === 0) {
      throw new VercelToolError("No values to sync — pass databaseUrl or link a database first.");
    }
    const synced = await syncNeonEnvToVercel({ token, projectId: link.projectId, vars, teamId: link.teamId, signal: ctx.signal });
    return `Synced to Vercel ${link.projectName ?? link.projectId}: ${synced.join(", ")}.`;
  },
  presentCall: () => "Sync Neon env to Vercel",
});

export const vercelDisconnectTool = defineTool({
  name: "vercel_disconnect",
  description: "Unlink the Vercel project from this app (remote project untouched).",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    writePublishLinks(ctx.appPath, { vercel: null });
    return "Vercel project unlinked (remote project untouched).";
  },
  presentCall: () => "Disconnect Vercel project",
});

export const ALL_VERCEL_TOOLS: ToolDef[] = [
  vercelConnectTool,
  vercelDeployTool,
  vercelDeploymentsTool,
  vercelEnvSyncTool,
  vercelDisconnectTool,
];
