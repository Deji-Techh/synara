import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import log from "electron-log";
import { safeJoin } from "./path_utils";
import { gitAdd } from "./git_utils";
import { resolveAttachmentLogicalPath } from "./media_path_utils";
import { withLock } from "./lock_utils";
import { deploySupabaseFunction } from "../../supabase_admin/supabase_management_client";
import {
  isServerFunction,
  isSharedServerModule,
  extractFunctionNameFromPath,
} from "../../supabase_admin/supabase_utils";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const logger = log.scope("copy_file_utils");

const SENSITIVE_PATTERNS = [
  /^\/etc\//,
  /^\/dev\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/boot\//,
  /^\/var\/log\//,
  new RegExp(`^${os.homedir()}/\\.ssh`),
  new RegExp(`^${os.homedir()}/\\.aws`),
  new RegExp(`^${os.homedir()}/\\.config/gcloud`),
  new RegExp(`^${os.homedir()}/\\.kube`),
];

function isPathBlocked(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(resolved)) return true;
  }
  return false;
}

export interface CopyFileResult {
  /** Whether the destination is a shared server module */
  sharedModuleChanged: boolean;
  /** Function deploy skipped because a shared server module changed first */
  skippedFunctionDeploy?: string;
  /** Error from Supabase function deployment, if any */
  deployError?: unknown;
}

/**
 * Copy a file or folder into a CAIDE app, supporting attachments, app-relative paths,
 * .caide/media paths, or external filesystem paths (~/Downloads, /tmp, /home/user/...).
 *
 * @throws Error if the path is a restricted system directory (~/.ssh, /etc/passwd)
 * @throws Error if the source path does not exist
 */
export async function executeCopyFile({
  from,
  to,
  appId,
  appPath,
  supabaseProjectId,
  supabaseOrganizationSlug,
  isSharedModulesChanged,
}: {
  from: string;
  to: string;
  appId: number;
  appPath: string;
  supabaseProjectId?: string | null;
  supabaseOrganizationSlug?: string | null;
  isSharedModulesChanged?: boolean;
}): Promise<CopyFileResult> {
  return withLock(appId, async () => {
    let fromFullPath: string;

    if (from.startsWith("attachments:")) {
      const attachment = await resolveAttachmentLogicalPath(appPath, from);
      if (!attachment) {
        throw new CaideError(`Attachment does not exist: ${from}`, CaideErrorKind.NotFound);
      }
      fromFullPath = attachment.filePath;
    } else if (from.startsWith("~") || path.isAbsolute(from)) {
      const rawPath = from.startsWith("~") ? path.join(os.homedir(), from.slice(1)) : from;
      fromFullPath = path.resolve(rawPath);
    } else {
      fromFullPath = safeJoin(appPath, from);
    }

    if (isPathBlocked(fromFullPath)) {
      throw new CaideError(
        `Cannot copy from a restricted system path: ${fromFullPath}`,
        CaideErrorKind.Precondition,
      );
    }

    if (!fs.existsSync(fromFullPath)) {
      throw new CaideError(
        `Source file or directory does not exist: ${fromFullPath}`,
        CaideErrorKind.NotFound,
      );
    }

    const realFromPath = fs.realpathSync(fromFullPath);
    if (isPathBlocked(realIsPath(realFromPath))) {
      throw new CaideError(
        `Source path resolves to a restricted system path: ${realFromPath}`,
        CaideErrorKind.Precondition,
      );
    }

    const toFullPath = safeJoin(appPath, to);
    const dirPath = path.dirname(toFullPath);
    fs.mkdirSync(dirPath, { recursive: true });

    const stat = fs.statSync(realFromPath);
    if (stat.isDirectory()) {
      fs.cpSync(realFromPath, toFullPath, { recursive: true });
      logger.log(`Successfully copied directory: ${realFromPath} -> ${toFullPath}`);
    } else {
      fs.copyFileSync(realFromPath, toFullPath);
      logger.log(`Successfully copied file: ${realFromPath} -> ${toFullPath}`);
    }

    // Add to git
    await gitAdd({ path: appPath, filepath: to });

    // Deploy Supabase function if applicable
    const sharedModuleChanged = isSharedServerModule(to);
    const effectiveSharedModulesChanged = isSharedModulesChanged || sharedModuleChanged;
    let deployError: unknown;
    let skippedFunctionDeploy: string | undefined;
    if (supabaseProjectId && isServerFunction(to)) {
      const functionName = extractFunctionNameFromPath(to);
      if (!effectiveSharedModulesChanged) {
        try {
          await deploySupabaseFunction({
            supabaseProjectId,
            functionName,
            appPath,
            organizationSlug: supabaseOrganizationSlug ?? null,
          });
        } catch (error) {
          logger.error("Failed to deploy Supabase function after copy:", error);
          deployError = error;
        }
      } else {
        skippedFunctionDeploy = functionName;
      }
    }

    return {
      sharedModuleChanged,
      skippedFunctionDeploy,
      deployError,
    };
  });
}

function realIsPath(p: string): string {
  return p;
}
