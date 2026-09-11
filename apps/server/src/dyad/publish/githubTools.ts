// FILE: githubTools.ts
// Purpose: GitHub publish agent tools (Phase 4a, PAT-first). gh CLI first
// (zero new secrets, user's existing auth); stored PAT fallback for API
// ops (create repo, collaborators). Links persist to .caide/publish.json.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { getVoiceApiKey } from "../../voice/transcriptionService.ts";
import {
  addGithubCollaborator,
  createGithubRepo,
  isGhCliAuthenticated,
  listGithubBranches,
  listGithubRepos,
  pushWithGhCli,
} from "./githubApi.ts";
import { readPublishLinks, writePublishLinks } from "./publishStore.ts";

export class GithubToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubToolError";
  }
}

/** PAT from stored settings key or env (Settings → Integrations, or GITHUB_TOKEN/GH_TOKEN). */
export function getGithubToken(): string | null {
  return getVoiceApiKey("github");
}

const createGithubRepoSchema = z.object({
  repo: z.string().describe("Repository name, e.g. my-app."),
  org: z.string().optional().describe("Organization login. Defaults to the authenticated user."),
});

export const createGithubRepoTool = defineTool({
  name: "create_github_repo",
  description: [
    "Create a PRIVATE GitHub repository (user or org). Requires a GitHub personal access token",
    "(repo scope) — add one in Settings → Integrations, or set GITHUB_TOKEN. Links the repo to the app automatically.",
  ].join(" "),
  schema: createGithubRepoSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = createGithubRepoSchema.parse(args);
    const token = getGithubToken();
    if (!token) {
      throw new GithubToolError("GitHub token missing — add a personal access token (repo scope) in Settings → Integrations.");
    }
    const created = await createGithubRepo({
      token,
      repo: parsed.repo,
      org: parsed.org,
      signal: ctx.signal,
    });
    writePublishLinks(ctx.appPath, {
      github: { org: created.owner || undefined, repo: created.name, branch: created.defaultBranch },
    });
    return `Private repo created and linked: ${created.fullName}. Push with github_push (gh CLI preferred).`;
  },
  presentCall: (args: any) => `Create GitHub repo${args.repo ? `: ${args.repo}` : ""}`,
});

const githubPushSchema = z.object({
  branch: z.string().optional().describe("Branch to push. Defaults to the current branch."),
});

export const githubPushTool = defineTool({
  name: "github_push",
  description: [
    "Push the workspace to the linked GitHub repo. Prefers the gh CLI (uses the user's existing",
    "`gh auth`, zero new secrets). When gh is absent or unauthenticated, configure a PAT remote instead.",
    "Link a repo first with create_github_repo (or pass owner/repo via an existing publish link).",
  ].join(" "),
  schema: githubPushSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = githubPushSchema.parse(args);
    const link = readPublishLinks(ctx.appPath).github;
    if (!link) {
      throw new GithubToolError("No GitHub repo linked — run create_github_repo first.");
    }
    const owner = link.org || "";
    if (!owner) {
      throw new GithubToolError("Linked repo has no owner — re-link with create_github_repo (org or user login required for push).");
    }
    const result = await pushWithGhCli({ appPath: ctx.appPath, owner, repo: link.repo, branch: parsed.branch });
    if (result.pushed) {
      if (parsed.branch?.trim()) {
        writePublishLinks(ctx.appPath, { github: { ...link, branch: parsed.branch.trim() } });
      }
      return `Pushed to ${owner}/${link.repo} via gh CLI.`;
    }
    return [
      `Push via gh CLI not possible: ${result.reason}.`,
      "Either run `gh auth login`, or configure a PAT remote: git remote set-url origin https://<user>:<PAT>@github.com/<owner>/<repo>.git (token from Settings → Integrations, NEVER print it).",
    ].join("\n");
  },
  presentCall: () => "Push to GitHub",
});

const githubStatusSchema = z.object({});

export const githubStatusTool = defineTool({
  name: "github_status",
  description: "Show the linked GitHub repo, gh CLI availability, branches, and collaborator count.",
  schema: githubStatusSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const link = readPublishLinks(ctx.appPath).github;
    const gh = await isGhCliAuthenticated(ctx.appPath);
    const lines = [
      link ? `Linked repo: ${link.org ? `${link.org}/` : ""}${link.repo}${link.branch ? ` (branch ${link.branch})` : ""}.` : "No GitHub repo linked.",
      `gh CLI: ${gh ? "authenticated" : "not available — PAT remote required for push"}.`,
    ];
    const token = getGithubToken();
    if (link?.org && token) {
      try {
        const branches = await listGithubBranches({ token, owner: link.org, repo: link.repo, signal: ctx.signal });
        lines.push(`Remote branches (${branches.length}): ${branches.slice(0, 10).join(", ")}${branches.length > 10 ? "…" : ""}.`);
      } catch (err) {
        lines.push(`Branch listing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (link && !token) {
      lines.push("Add a GitHub token in Settings → Integrations for branch/collaborator management.");
    }
    return lines.join("\n");
  },
  presentCall: () => "GitHub status",
});

const githubCollaboratorSchema = z.object({
  username: z.string().describe("GitHub username to invite."),
  permission: z.enum(["pull", "triage", "push", "maintain", "admin"]).optional().describe("Permission (default push)."),
});

export const githubCollaboratorTool = defineTool({
  name: "github_collaborator",
  description: "Invite a collaborator to the linked GitHub repo. Requires a token with repo permissions.",
  schema: githubCollaboratorSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = githubCollaboratorSchema.parse(args);
    const link = readPublishLinks(ctx.appPath).github;
    if (!link?.org) {
      throw new GithubToolError("No linked repo with owner — run create_github_repo first.");
    }
    const token = getGithubToken();
    if (!token) {
      throw new GithubToolError("GitHub token missing — add one in Settings → Integrations.");
    }
    await addGithubCollaborator({
      token,
      owner: link.org,
      repo: link.repo,
      username: parsed.username,
      permission: parsed.permission,
      signal: ctx.signal,
    });
    return `Invited ${parsed.username} to ${link.org}/${link.repo} (${parsed.permission ?? "push"}).`;
  },
  presentCall: (args: any) => `Invite ${args.username ?? "collaborator"} to GitHub repo`,
});

const listGithubReposSchema = z.object({});

export const listGithubReposTool = defineTool({
  name: "list_github_repos",
  description: "List the authenticated user's GitHub repositories (newest first). Requires a token.",
  schema: listGithubReposSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const token = getGithubToken();
    if (!token) {
      throw new GithubToolError("GitHub token missing — add one in Settings → Integrations.");
    }
    const repos = await listGithubRepos({ token, signal: ctx.signal });
    if (repos.length === 0) return "No repositories found.";
    return repos
      .slice(0, 20)
      .map((r) => `- ${r.fullName}${r.private ? " (private)" : ""}`)
      .join("\n");
  },
  presentCall: () => "List GitHub repos",
});

export const ALL_GITHUB_TOOLS: ToolDef[] = [
  createGithubRepoTool,
  githubPushTool,
  githubStatusTool,
  githubCollaboratorTool,
  listGithubReposTool,
];
