import { z } from "zod";
import { ToolDefinition, AgentContext, escapeXmlAttr } from "./types";
import { executeCopyFile } from "@/ipc/utils/copy_file_utils";
import { queueCloudSandboxSnapshotSync } from "@/ipc/utils/cloud_sandbox_provider";

const copyFileSchema = z.object({
  from: z
    .string()
    .describe(
      "The source file or folder path (can be attachments:<name>, a .caide/media path, an absolute path like ~/Downloads/image.png or /tmp/..., or a path relative to the app root)",
    ),
  to: z.string().describe("The destination file or directory path relative to the app root"),
  description: z
    .string()
    .optional()
    .describe("Brief description of why the file or folder is being copied"),
});

export const copyFileTool: ToolDefinition<z.infer<typeof copyFileSchema>> = {
  name: "copy_file",
  description:
    "Copy a file or directory from any location into the project codebase. Supports attachments (attachments:<name>), .caide/media paths, external filesystem paths (~/Downloads, /tmp, Desktop), or paths within the codebase.",
  inputSchema: copyFileSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Copy ${args.from} to ${args.to}`,

  buildXml: (args, _isComplete) => {
    if (!args.from || !args.to) return undefined;
    return `<caide-copy from="${escapeXmlAttr(args.from)}" to="${escapeXmlAttr(args.to)}" description="${escapeXmlAttr(args.description ?? "")}"></caide-copy>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const result = await executeCopyFile({
      from: args.from,
      to: args.to,
      appId: ctx.appId,
      appPath: ctx.appPath,
      supabaseProjectId: ctx.supabaseProjectId,
      supabaseOrganizationSlug: ctx.supabaseOrganizationSlug,
      isSharedModulesChanged: ctx.isSharedModulesChanged,
    });

    if (result.sharedModuleChanged) {
      ctx.isSharedModulesChanged = true;
      ctx.sharedServerModulePaths.push(args.to);
    }

    if (result.skippedFunctionDeploy) {
      ctx.pendingFunctionDeploys.push(result.skippedFunctionDeploy);
    }

    queueCloudSandboxSnapshotSync({
      appId: ctx.appId,
      changedPaths: [args.to],
    });

    if (result.deployError) {
      return `File copied, but failed to deploy Supabase function: ${result.deployError}`;
    }

    return `Successfully copied ${args.from} to ${args.to}`;
  },
};
