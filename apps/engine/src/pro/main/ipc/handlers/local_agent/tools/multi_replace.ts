import fs from "node:fs";
import { z } from "zod";
import log from "electron-log";
import { ToolDefinition, AgentContext, escapeXmlAttr, escapeXmlContent } from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { deploySupabaseFunction } from "@/supabase_admin/supabase_management_client";
import {
  extractFunctionNameFromPath,
  isServerFunction,
  isSharedServerModule,
} from "@/supabase_admin/supabase_utils";
import { sendTelemetryEvent } from "@/ipc/utils/telemetry";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { queueCloudSandboxSnapshotSync } from "@/ipc/utils/cloud_sandbox_provider";
import { withLock, getFileWriteKey } from "@/ipc/utils/lock_utils";

const logger = log.scope("multi_replace");

const replacementChunkSchema = z.object({
  startLine: z.number().describe("The starting line number (1-indexed) of the chunk to replace."),
  endLine: z.number().describe("The ending line number (1-indexed) of the chunk to replace."),
  replacementContent: z.string().describe("The content to replace the target chunk with."),
});

const multiReplaceSchema = z.object({
  file_path: z.string().describe("The path to the file you want to search and replace in."),
  chunks: z
    .array(replacementChunkSchema)
    .min(1)
    .describe(
      "A list of chunks to replace in the file. Start and end lines are 1-indexed and inclusive.",
    ),
});

export const multiReplaceTool: ToolDefinition<z.infer<typeof multiReplaceSchema>> = {
  name: "multi_replace",
  description: `Use this tool to propose multiple, targeted line-based edits to an existing file.

This tool is significantly more token-efficient than rewriting the entire file or using block-based search/replace.
You provide an array of chunks, specifying the startLine and endLine (1-indexed, inclusive) and the replacementContent.

CRITICAL REQUIREMENTS:
1. Ensure the startLine and endLine exactly match the lines you want to replace.
2. The chunks must be ordered from top to bottom (ascending line numbers).
3. Chunks must NOT overlap.
4. To insert code at a specific line without removing anything, set both startLine and endLine to the line AFTER the insertion point, and include the existing line at the end of your replacementContent. Or just replace the single line with the new content + the old line.
`,
  inputSchema: multiReplaceSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Edit ${args.file_path} (${args.chunks?.length ?? 0} chunks)`,

  buildXml: (args, isComplete) => {
    if (!args.file_path) return undefined;

    let xml = `<caide-multi-replace path="${escapeXmlAttr(args.file_path)}">\n`;
    if (args.chunks) {
      for (const chunk of args.chunks) {
        if (chunk.startLine && chunk.endLine) {
          xml += `  <chunk start="${chunk.startLine}" end="${chunk.endLine}">\n${escapeXmlContent(chunk.replacementContent ?? "")}\n  </chunk>\n`;
        }
      }
    }

    if (isComplete) {
      xml += "</caide-multi-replace>";
    }

    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const fullFilePath = safeJoin(ctx.appPath, args.file_path);

    // Track if this is a shared module
    if (isSharedServerModule(args.file_path)) {
      ctx.isSharedModulesChanged = true;
      ctx.sharedServerModulePaths.push(args.file_path);
    }

    await withLock(getFileWriteKey(fullFilePath), async () => {
      if (!fs.existsSync(fullFilePath)) {
        throw new CaideError(`File does not exist: ${args.file_path}`, CaideErrorKind.NotFound);
      }

      const original = await fs.promises.readFile(fullFilePath, "utf8");

      // We will split by newline but handle both \n and \r\n
      const lines = original.split(/\r?\n/);

      // Validate chunks
      for (let i = 0; i < args.chunks.length; i++) {
        const chunk = args.chunks[i];
        if (chunk.startLine < 1 || chunk.startLine > lines.length) {
          throw new CaideError(
            `Invalid startLine: ${chunk.startLine} (file has ${lines.length} lines)`,
            CaideErrorKind.Validation,
          );
        }
        if (chunk.endLine < chunk.startLine || chunk.endLine > lines.length) {
          throw new CaideError(`Invalid endLine: ${chunk.endLine}`, CaideErrorKind.Validation);
        }
        if (i > 0) {
          if (args.chunks[i - 1].endLine >= chunk.startLine) {
            throw new CaideError(
              `Chunks must be in ascending order and non-overlapping`,
              CaideErrorKind.Validation,
            );
          }
        }
      }

      // Apply changes from bottom to top to avoid line numbers shifting!
      const sortedChunks = [...args.chunks].sort((a, b) => b.startLine - a.startLine);

      for (const chunk of sortedChunks) {
        // Convert 1-indexed to 0-indexed
        const startIndex = chunk.startLine - 1;
        const deleteCount = chunk.endLine - chunk.startLine + 1;

        // Remove the old lines and insert the new lines
        const replacementLines = chunk.replacementContent.split(/\r?\n/);
        lines.splice(startIndex, deleteCount, ...replacementLines);
      }

      const newContent = lines.join("\n");

      await fs.promises.writeFile(fullFilePath, newContent);
      logger.log(`Successfully applied multi-replace to: ${fullFilePath}`);

      queueCloudSandboxSnapshotSync({
        appId: ctx.appId,
        changedPaths: [args.file_path],
      });

      sendTelemetryEvent("local_agent:multi_replace:success", {
        filePath: args.file_path,
        chunkCount: args.chunks.length,
      });
    });

    // Deploy Supabase function if applicable
    if (ctx.supabaseProjectId && isServerFunction(args.file_path)) {
      try {
        const functionName = extractFunctionNameFromPath(args.file_path);
        if (!ctx.isSharedModulesChanged) {
          await deploySupabaseFunction({
            supabaseProjectId: ctx.supabaseProjectId,
            functionName,
            appPath: ctx.appPath,
            organizationSlug: ctx.supabaseOrganizationSlug ?? null,
          });
        } else {
          ctx.pendingFunctionDeploys.push(functionName);
        }
      } catch (error) {
        return `Multi-replace applied, but failed to deploy Supabase function: ${error}`;
      }
    }

    return `Successfully applied ${args.chunks.length} edits to ${args.file_path}`;
  },
};
