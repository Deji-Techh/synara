import { z } from "zod";
import {
  AgentContext,
  ToolDefinition,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import {
  runRawExploreCode,
  DEFAULT_MAX_FILES,
  MAX_FILES,
} from "./explore_code_raw";
import { getExploreCodeAvailability } from "./explore_code";
import { resolveTargetAppPath } from "./resolve_app_context";
import type { CodeExplorerResult } from "../../../../../../../shared/code_explorer_types";

const lspSymbolLookupSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "The symbol, function, or class name to look up in the workspace (e.g. 'User class', 'handleAuth references').",
    ),
  app_name: z
    .string()
    .optional()
    .describe(
      "Optional. Name of the app to explore. Omit for the current app.",
    ),
  max_files: z
    .number()
    .int()
    .min(1)
    .max(MAX_FILES)
    .optional()
    .describe(`Max files to return (default: ${DEFAULT_MAX_FILES}).`),
});

function formatLspResult(result: CodeExplorerResult): string {
  const lines: string[] = [
    `## LSP Lookup: ${result.query}`,
    `Found ${result.totalSymbols} symbols across ${result.totalFiles} files.`,
  ];

  if (result.notes.length > 0) {
    lines.push("", ...result.notes.map((note) => `[${note}]`));
  }

  if (result.files.length === 0) {
    lines.push("", "No matching TypeScript symbols found.");
    return lines.join("\n");
  }

  for (const file of result.files) {
    lines.push("", `### ${file.path}`);
    for (const symbol of file.symbols) {
      lines.push(
        `- \`${symbol.name}\` (${symbol.kind}) at line ${symbol.line}`,
      );
    }
    // We intentionally OMIT the raw source lines (windows) to save tokens,
    // which makes this tool extremely lightweight.
  }

  return lines.join("\n");
}

export const lspSymbolLookupTool: ToolDefinition<
  z.infer<typeof lspSymbolLookupSchema>
> = {
  name: "lsp_symbol_lookup",
  description: `A highly token-efficient tool to find the exact file paths and line numbers where a symbol (class, function, variable) is defined or referenced.
This uses a TypeScript AST worker to find semantic matches, ignoring raw text noise.
Unlike explore_code, this tool does NOT return the source code itself, only the line numbers. Use this for reconnaissance, then use view_file or multi_replace with exact line numbers.`,
  inputSchema: lspSymbolLookupSchema,
  defaultConsent: "always",
  usesEngineEndpoint: false,

  isEnabled: (ctx) => getExploreCodeAvailability(ctx).enabled,
  getConsentPreview: (args) => `Lookup symbol: ${args.query}`,

  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<caide-lsp-lookup query="${escapeXmlAttr(args.query)}">Looking up...</caide-lsp-lookup>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const targetAppPath = resolveTargetAppPath(ctx, args.app_name);

    ctx.onXmlStream(
      `<caide-lsp-lookup query="${escapeXmlAttr(args.query)}">\nLooking up...</caide-lsp-lookup>`,
    );

    const result = await runRawExploreCode({
      appPath: targetAppPath,
      args: {
        query: args.query,
        max_files: args.max_files,
        // Keep depth low for LSP lookups to keep it fast
        max_depth: 1,
      },
    });

    const formatted = formatLspResult(result);

    ctx.onXmlComplete(
      `<caide-lsp-lookup query="${escapeXmlAttr(args.query)}">\n${escapeXmlContent(formatted)}\n</caide-lsp-lookup>`,
    );

    return formatted;
  },
};
