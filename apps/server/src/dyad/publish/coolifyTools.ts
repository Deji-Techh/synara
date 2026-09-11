// FILE: coolifyTools.ts
// Purpose: Coolify self-host publish agent tools (Phase 4c, PAT-first).
// Token from Settings → Integrations or COOLIFY_TOKEN env; instance URL and
// link state persist to .caide/publish.json (token never touches disk chats).

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { getVoiceApiKey } from "../../voice/transcriptionService.ts";
import {
  createCoolifyProject,
  getCoolifyApplication,
  listCoolifyProjects,
  listCoolifyServers,
  probeCoolifyInstance,
  triggerCoolifyDeploy,
} from "./coolifyApi.ts";
import { readPublishLinks, writePublishLinks } from "./publishStore.ts";

export class CoolifyToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoolifyToolError";
  }
}

/** Token from stored settings key or env (Settings → Integrations, or COOLIFY_TOKEN). */
export function getCoolifyToken(): string | null {
  return getVoiceApiKey("coolify");
}

const coolifyConnectSchema = z.object({
  instanceUrl: z.string().describe("Coolify instance URL, e.g. https://coolify.example.com."),
  projectName: z.string().optional().describe("Create and link a project with this name (else link manually)."),
});

export const coolifyConnectTool = defineTool({
  name: "coolify_connect",
  description: [
    "Connect the app to a self-hosted Coolify instance: probes URL + token, optionally creates a project,",
    "and persists the connection to .caide/publish.json. Requires a Coolify API token",
    "(instance → Keys & Tokens) in Settings → Integrations or COOLIFY_TOKEN env.",
  ].join(" "),
  schema: coolifyConnectSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = coolifyConnectSchema.parse(args);
    const token = getCoolifyToken();
    if (!token) {
      throw new CoolifyToolError("Coolify token missing — add an API token in Settings → Integrations.");
    }
    const instanceUrl = parsed.instanceUrl.trim().replace(/\/+$/, "");
    const probe = await probeCoolifyInstance({ instanceUrl, token, signal: ctx.signal });
    let projectUuid: string | undefined;
    let projectName: string | undefined;
    if (parsed.projectName?.trim()) {
      const created = await createCoolifyProject({ instanceUrl, token, name: parsed.projectName, signal: ctx.signal });
      projectUuid = created.uuid;
      projectName = created.name;
    }
    writePublishLinks(ctx.appPath, {
      coolify: {
        instanceUrl,
        ...(projectUuid ? { projectUuid } : {}),
      },
    });
    return [
      `Coolify connected: ${instanceUrl}${probe.version ? ` (v${probe.version})` : ""}${projectName ? `, project ${projectName}` : ""}.`,
      "Connection persists in .caide/publish.json across chats.",
    ].join("\n");
  },
  presentCall: () => "Connect Coolify instance",
});

function requireCoolifyConnection(ctx: { appPath: string }): { instanceUrl: string; token: string } {
  const token = getCoolifyToken();
  if (!token) {
    throw new CoolifyToolError("Coolify token missing — add an API token in Settings → Integrations.");
  }
  const instanceUrl = readPublishLinks(ctx.appPath).coolify?.instanceUrl?.trim() ?? "";
  if (!instanceUrl) {
    throw new CoolifyToolError("No Coolify instance linked — run coolify_connect first.");
  }
  return { instanceUrl, token };
}

export const coolifyDiscoverTool = defineTool({
  name: "coolify_discover",
  description: "List Coolify servers and projects on the linked instance.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const { instanceUrl, token } = requireCoolifyConnection(ctx);
    const [servers, projects] = await Promise.all([
      listCoolifyServers({ instanceUrl, token, signal: ctx.signal }),
      listCoolifyProjects({ instanceUrl, token, signal: ctx.signal }),
    ]);
    const lines = [
      `Servers (${servers.length}): ${servers.slice(0, 10).map((s) => s.name ?? s.uuid).join(", ") || "none"}.`,
      `Projects (${projects.length}): ${projects.slice(0, 10).map((p) => `${p.name ?? p.uuid} (${p.uuid})`).join(", ") || "none"}.`,
    ];
    return lines.join("\n");
  },
  presentCall: () => "Discover Coolify servers/projects",
});

const coolifyDeploySchema = z.object({
  applicationUuid: z.string().optional().describe("Application uuid. Defaults to the linked application."),
  force: z.boolean().optional().describe("Force rebuild even when nothing changed."),
});

export const coolifyDeployTool = defineTool({
  name: "coolify_deploy",
  description: [
    "Trigger a Coolify deployment for the linked application (or an explicit application uuid).",
    "Link the application first (coolify_connect stores project; set the application uuid when known). Async — check coolify_status.",
  ].join(" "),
  schema: coolifyDeploySchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = coolifyDeploySchema.parse(args);
    const { instanceUrl, token } = requireCoolifyConnection(ctx);
    const applicationUuid = parsed.applicationUuid?.trim() || readPublishLinks(ctx.appPath).coolify?.applicationUuid || "";
    if (!applicationUuid) {
      throw new CoolifyToolError("No application uuid — pass applicationUuid (find it in the Coolify dashboard for this project).");
    }
    await triggerCoolifyDeploy({ instanceUrl, token, applicationUuid, force: parsed.force, signal: ctx.signal });
    writePublishLinks(ctx.appPath, {
      coolify: { ...(readPublishLinks(ctx.appPath).coolify ?? {}), applicationUuid },
    });
    return `Deploy queued for application ${applicationUuid}. Check coolify_status.`;
  },
  presentCall: () => "Deploy via Coolify",
});

export const coolifyStatusTool = defineTool({
  name: "coolify_status",
  description: "Show the linked Coolify instance/project/application and the application status.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const link = readPublishLinks(ctx.appPath).coolify;
    if (!link?.instanceUrl) return "No Coolify instance linked — run coolify_connect first.";
    const lines = [`Instance: ${link.instanceUrl}.`];
    if (link.projectUuid) lines.push(`Project: ${link.projectUuid}.`);
    const token = getCoolifyToken();
    if (!token) {
      lines.push("Token missing — status needs Settings → Integrations token.");
      return lines.join("\n");
    }
    if (link.applicationUuid) {
      try {
        const app = await getCoolifyApplication({ instanceUrl: link.instanceUrl, token, applicationUuid: link.applicationUuid, signal: ctx.signal });
        lines.push(`Application ${app.name ?? app.uuid}: ${app.status ?? "unknown"}${app.fqdn ? ` — https://${app.fqdn}` : ""}.`);
      } catch (err) {
        lines.push(`Status lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      lines.push("No application linked yet.");
    }
    return lines.join("\n");
  },
  presentCall: () => "Coolify status",
});

export const coolifyDisconnectTool = defineTool({
  name: "coolify_disconnect",
  description: "Unlink the Coolify instance from this app (remote projects untouched).",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    writePublishLinks(ctx.appPath, { coolify: null });
    return "Coolify instance unlinked (remote projects untouched).";
  },
  presentCall: () => "Disconnect Coolify instance",
});

export const ALL_COOLIFY_TOOLS: ToolDef[] = [
  coolifyConnectTool,
  coolifyDiscoverTool,
  coolifyDeployTool,
  coolifyStatusTool,
  coolifyDisconnectTool,
];
