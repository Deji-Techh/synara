import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ToolDefinition, AgentContext, escapeXmlAttr } from "./types";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const SENSITIVE_PATTERNS = [
  /^\/etc\//,
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/boot\//,
  /^\/var\/log\//,
  new RegExp(`^${os.homedir()}/.ssh`),
  new RegExp(`^${os.homedir()}/.aws`),
  new RegExp(`^${os.homedir()}/.config/gcloud`),
  new RegExp(`^${os.homedir()}/.kube`),
];

const MAX_COPY_SIZE = 50 * 1024 * 1024;

function isPathBlocked(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(resolved)) return true;
  }
  return false;
}

function getFileSizeRecursive(fsPath: string): number {
  const stat = fs.statSync(fsPath);
  if (stat.isFile()) return stat.size;
  if (stat.isDirectory()) {
    let total = 0;
    const entries = fs.readdirSync(fsPath);
    for (const entry of entries) {
      total += getFileSizeRecursive(path.join(fsPath, entry));
    }
    return total;
  }
  return 0;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const copyReferenceSchema = z.object({
  path: z.string().describe("Absolute path to the file or folder to copy into the project"),
  destination: z
    .string()
    .optional()
    .describe(
      "Relative path within the project for the copy destination (defaults to the file/folder name in the project root)",
    ),
  description: z
    .string()
    .optional()
    .describe("Brief description of what this file contains and why it's needed"),
});

export const copyReferenceTool: ToolDefinition<z.infer<typeof copyReferenceSchema>> = {
  name: "copy_reference",
  description: `Copy a file or folder from outside the project into the current project. Use this when the user provides a reference file path and wants it included in their project. Sensitive system paths (/etc/, ~/.ssh/, etc.) are blocked. Shows a consent prompt with file size and details before copying.`,
  inputSchema: copyReferenceSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => {
    try {
      const absPath = path.resolve(args.path);
      if (!fs.existsSync(absPath)) return `File not found: ${args.path}`;
      const size = formatSize(getFileSizeRecursive(absPath));
      const stat = fs.statSync(absPath);
      const type = stat.isDirectory() ? "folder" : "file";
      return `Copy ${type} "${path.basename(absPath)}" (${size}) from ${absPath} into the project${args.destination ? ` to ${args.destination}` : ""}`;
    } catch {
      return `Copy ${args.path} into the project`;
    }
  },

  buildXml: (args, _isComplete) => {
    if (!args.path) return undefined;
    return `<caide-copy-reference path="${escapeXmlAttr(args.path)}"${args.destination ? ` destination="${escapeXmlAttr(args.destination)}"` : ""}${args.description ? ` description="${escapeXmlAttr(args.description)}"` : ""}></caide-copy-reference>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const absPath = path.resolve(args.path);

    if (!fs.existsSync(absPath)) {
      throw new CaideError(`File or folder not found: ${absPath}`, CaideErrorKind.NotFound);
    }

    if (isPathBlocked(absPath)) {
      throw new CaideError(
        `Cannot copy from a restricted system path: ${absPath}`,
        CaideErrorKind.Precondition,
      );
    }

    const size = getFileSizeRecursive(absPath);
    if (size > MAX_COPY_SIZE) {
      throw new CaideError(
        `File/folder too large to copy (${formatSize(size)} exceeds ${formatSize(MAX_COPY_SIZE)} limit)`,
        CaideErrorKind.Validation,
      );
    }

    const stat = fs.statSync(absPath);
    const destName = args.destination ?? path.basename(absPath);
    const destPath = path.join(ctx.appPath, destName);

    if (fs.existsSync(destPath)) {
      return `Destination already exists: ${destPath}. Choose a different destination path or remove the existing file first.`;
    }

    if (stat.isDirectory()) {
      fs.cpSync(absPath, destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(absPath, destPath);
    }

    return `Successfully copied ${stat.isDirectory() ? "folder" : "file"} from ${absPath} to ${destPath}`;
  },
};
