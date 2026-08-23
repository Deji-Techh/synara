import path from "node:path";
import { z } from "zod";
import { glob } from "glob";
import { ToolDefinition, AgentContext, escapeXmlAttr, escapeXmlContent } from "./types";
import { listCodebaseFileMetadata } from "../../../../../../utils/codebase";
import { resolveDirectoryWithinAppPath } from "./path_safety";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import {
  CAIDE_INTERNAL_GLOB,
  filterCaideInternalFiles,
  resolveTargetAppPath,
} from "./resolve_app_context";

const MAX_PATHS_TO_RETURN = 1_000;

const listFilesSchema = z.object({
  directory: z.string().optional().describe("Optional subdirectory to list"),
  app_name: z
    .string()
    .optional()
    .describe(
      "Optional. Name of a referenced app (from `@app:Name` mentions in the user's prompt) to list from instead of the current app. Omit to list the current app.",
    ),
  recursive: z.boolean().optional().describe("Whether to list files recursively (default: false)"),
  include_ignored: z
    .boolean()
    .optional()
    .describe(
      "Whether to include git-ignored and hidden files/directories such as node_modules (default: false).",
    ),
});

type ListFilesArgs = z.infer<typeof listFilesSchema>;

interface ListedPath {
  path: string;
  isDirectory: boolean;
}

function getDisplayPath(entry: ListedPath): string {
  return entry.isDirectory ? `${entry.path}/` : entry.path;
}

function sortListedPaths(entries: ListedPath[]): ListedPath[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });
}

function getXmlAttributes(args: ListFilesArgs, count?: number, total?: number) {
  const dirAttr = args.directory ? ` directory="${escapeXmlAttr(args.directory)}"` : "";
  const appNameAttr = args.app_name ? ` app_name="${escapeXmlAttr(args.app_name)}"` : "";
  const recursiveAttr = args.recursive !== undefined ? ` recursive="${args.recursive}"` : "";
  const includeIgnoredAttr =
    args.include_ignored !== undefined ? ` include_ignored="${args.include_ignored}"` : "";
  const countAttr = count !== undefined ? ` count="${count}"` : "";
  const totalAttr = total !== undefined && total > (count ?? 0) ? ` total="${total}"` : "";
  const truncatedAttr = totalAttr ? ` truncated="true"` : "";
  return `${dirAttr}${appNameAttr}${recursiveAttr}${includeIgnoredAttr}${countAttr}${totalAttr}${truncatedAttr}`;
}

export const listFilesTool: ToolDefinition<ListFilesArgs> = {
  name: "list_files",
  description:
    "List files in the application directory. By default, lists only the immediate directory contents. Use recursive=true to list all files recursively. Use include_ignored=true to include git-ignored and hidden paths; recursive ignored listings require directory to be set. Results are capped at 1000 paths.",
  inputSchema: listFilesSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => {
    const recursiveText = args.recursive ? " (recursive)" : "";
    const ignoredText = args.include_ignored ? " (include ignored)" : "";
    const appSuffix = args.app_name ? ` (app: ${args.app_name})` : "";
    const target = args.directory ?? "all files";
    return `List ${target}${recursiveText}${ignoredText}${appSuffix}`;
  },

  buildXml: (args, isComplete) => {
    if (isComplete) {
      return undefined;
    }
    return `<caide-list-files${getXmlAttributes(args)}></caide-list-files>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const targetAppPath = resolveTargetAppPath(ctx, args.app_name);

    // Validate directory path to prevent path traversal attacks
    let sanitizedDirectory: string | undefined;
    if (args.directory) {
      const relativePathFromApp = resolveDirectoryWithinAppPath({
        appPath: targetAppPath,
        directory: args.directory,
      });

      // Normalize for glob usage (glob treats "\" as an escape on Windows)
      const normalizedRelativePath = relativePathFromApp
        .split(path.sep)
        .join("/")
        .replace(/\\/g, "/");

      // Empty means "root"
      sanitizedDirectory = normalizedRelativePath || undefined;
    }

    if (args.include_ignored && args.recursive && !sanitizedDirectory) {
      throw new CaideError(
        "include_ignored=true with recursive=true requires a non-root directory to avoid listing too many files.",
        CaideErrorKind.Validation,
      );
    }

    if (
      args.recursive &&
      sanitizedDirectory &&
      (sanitizedDirectory.startsWith("../") || sanitizedDirectory === "..")
    ) {
      // Fallback to non-recursive listing for paths outside app path to avoid throwing fatal validation errors
      args.recursive = false;
    }

    // Use "**" for recursive, "*" for non-recursive (immediate children only)
    const globSuffix = args.recursive ? "/**" : "/*";
    const globPath = sanitizedDirectory ? sanitizedDirectory + globSuffix : globSuffix.slice(1); // Remove leading "/" for root directory

    let allPaths: ListedPath[];

    const isOutsideApp = Boolean(
      sanitizedDirectory && (sanitizedDirectory.startsWith("../") || sanitizedDirectory === ".."),
    );

    if (args.include_ignored || isOutsideApp) {
      const normalizedAppPath = targetAppPath.replace(/\\/g, "/");
      const globPattern = `${normalizedAppPath}/${globPath}`;
      const ignoredGlobs = args.app_name
        ? ["**/.git", "**/.git/**", CAIDE_INTERNAL_GLOB]
        : ["**/.git", "**/.git/**"];
      const ignoredPaths = await glob(globPattern, {
        withFileTypes: true,
        dot: true,
        ignore: ignoredGlobs,
      });

      allPaths = sortListedPaths(
        ignoredPaths.map((entry) => ({
          path: path.relative(targetAppPath, entry.fullpath()).split(path.sep).join("/"),
          isDirectory: entry.isDirectory(),
        })),
      );
    } else {
      const fetchGlob = sanitizedDirectory ? sanitizedDirectory + "/**" : "**";
      const { files } = await listCodebaseFileMetadata({
        appPath: targetAppPath,
        chatContext: {
          contextPaths: [{ globPath: fetchGlob }],
          smartContextAutoIncludes: [],
          excludePaths: [],
        },
      });

      const filteredFiles = filterCaideInternalFiles(files, args.app_name);

      if (args.recursive) {
        allPaths = sortListedPaths(
          filteredFiles.map((file) => ({
            path: file.path,
            isDirectory: false,
          })),
        );
      } else {
        const childrenMap = new Map<string, ListedPath>();
        const prefix = sanitizedDirectory ? sanitizedDirectory + "/" : "";

        for (const file of filteredFiles) {
          if (sanitizedDirectory && !file.path.startsWith(prefix)) continue;

          const remainder = sanitizedDirectory ? file.path.slice(prefix.length) : file.path;
          const slashIndex = remainder.indexOf("/");

          if (slashIndex === -1) {
            childrenMap.set(remainder, {
              path: file.path,
              isDirectory: false,
            });
          } else {
            const dirName = remainder.slice(0, slashIndex);
            const dirPath = prefix + dirName;
            if (!childrenMap.has(dirName)) {
              childrenMap.set(dirName, {
                path: dirPath,
                isDirectory: true,
              });
            }
          }
        }
        allPaths = sortListedPaths(Array.from(childrenMap.values()));
      }
    }

    const totalCount = allPaths.length;
    const cappedPaths = allPaths.slice(0, MAX_PATHS_TO_RETURN);
    const wasTruncated = totalCount > cappedPaths.length;

    // Build full file list for LLM
    const allFilesList = cappedPaths.map((entry) => " - " + getDisplayPath(entry)).join("\n") || "";
    // Guard for empty new apps: tell the model to stop exploring and write the plan.
    const resultText =
      totalCount === 0
        ? "(No files found — this is a new Flutter app with only the scaffold. Do not call list_files again. Proceed to write_plan or planning_questionnaire.)"
        : wasTruncated
          ? `${allFilesList}\n\n[TRUNCATED: Showing ${cappedPaths.length} of ${totalCount} paths. Use directory to narrow the listing.]`
          : allFilesList;

    // Build abbreviated list for UI display
    const MAX_FILES_TO_SHOW = 20;
    const displayedFiles = cappedPaths.slice(0, MAX_FILES_TO_SHOW);
    const abbreviatedList =
      displayedFiles.map((entry) => " - " + getDisplayPath(entry)).join("\n") || "";
    const countInfo =
      totalCount > MAX_FILES_TO_SHOW
        ? `\n... and ${totalCount - MAX_FILES_TO_SHOW} more paths (${totalCount} total)`
        : `\n(${totalCount} paths total)`;

    // Write abbreviated list to UI
    ctx.onXmlComplete(
      `<caide-list-files${getXmlAttributes(args, cappedPaths.length, totalCount)}>${escapeXmlContent(abbreviatedList + countInfo)}</caide-list-files>`,
    );

    // Return full file list for LLM
    return resultText;
  },
};
