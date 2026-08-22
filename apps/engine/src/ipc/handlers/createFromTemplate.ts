import path from "path";
import fs from "fs-extra";
import { app } from "electron";
import { copyDirectoryRecursive } from "../utils/file_utils";
import { gitClone, getCurrentCommitHash } from "../utils/git_utils";
import { readSettings } from "@/main/settings";
import { getTemplateOrThrow } from "../utils/template_utils";
import { getFlutterExecutable, ensureFlutterSdkAvailable } from "@/ipc/utils/flutter_utils";
import log from "electron-log";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { spawn } from "node:child_process";
import { emit } from "@/ipc/utils/event_bus";

const logger = log.scope("createFromTemplate");

/**
 * Caide builds Flutter apps only. Fall back to a real `flutter create` when the
 * bundled `scaffold-flutter/` template is absent (e.g. a build-artifact-only
 * dump or an unpackaged checkout), so app creation is never blocked on a
 * committed template and never silently produces a React/web project.
 */
async function ensureFlutterForCreate(): Promise<string> {
  try {
    return await ensureFlutterSdkAvailable((p) => {
      try {
        emit("flutter:toolchain:progress", p);
      } catch {}
    });
  } catch {
    return getFlutterExecutable();
  }
}

function createFlutterProjectViaToolchain(fullAppPath: string): Promise<void> {
  const appName = path
    .basename(fullAppPath)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
  return new Promise(async (resolve, reject) => {
    const flutter = await ensureFlutterForCreate();
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      fn();
    };
    timeout = setTimeout(() => {
      settle(() =>
        reject(new CaideError(`flutter create timed out (${flutter})`, CaideErrorKind.External)),
      );
    }, 5 * 60_000);

    // flutter create needs its target directory to exist (it runs with
    // cwd = fullAppPath). The template-copy path creates the directory
    // implicitly; the toolchain-only path — packaged builds ship no scaffold
    // template — reaches here with nothing on disk, and spawn would fail
    // with ENOENT.
    try {
      await fs.ensureDir(fullAppPath);
    } catch (error) {
      settle(() =>
        reject(
          new CaideError(
            `flutter create could not prepare ${fullAppPath}: ${(error as Error).message}`,
            CaideErrorKind.External,
          ),
        ),
      );
      return;
    }
    const child = spawn(
      flutter,
      ["create", "--org", "com.caide", "--project-name", appName || "caide_app", "."],
      { cwd: fullAppPath, shell: false, stdio: "pipe", windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      settle(() =>
        reject(
          new CaideError(
            `flutter create could not start: ${error.message}; stderr: ${stderr}`,
            CaideErrorKind.External,
          ),
        ),
      );
    });
    child.on("close", (code) => {
      settle(() => {
        if (code === 0) {
          // flutter create leaves an empty .gitignore and a fresh .git? It does
          // not init git; the caller (createApp) runs initRepoWithInitialCommit.
          resolve();
        } else {
          reject(
            new CaideError(
              `flutter create failed with code ${code}; stderr: ${stderr.slice(-2000)}`,
              CaideErrorKind.External,
            ),
          );
        }
      });
    });
  });
}

export async function createFromTemplate({
  fullAppPath,
  templateId: requestedTemplateId,
}: {
  fullAppPath: string;
  templateId?: string;
}) {
  const settings = readSettings();
  const templateId = requestedTemplateId ?? settings.selectedTemplateId;

  if (templateId === "flutter") {
    const scaffoldDir = "scaffold-flutter";
    const sourceScaffoldPath = path.join(__dirname, "..", "..", scaffoldDir);
    const engineScaffoldPath = path.join(process.cwd(), "apps", "engine", scaffoldDir);
    const repoScaffoldPath = path.join(process.cwd(), scaffoldDir);
    const candidatePath = [sourceScaffoldPath, engineScaffoldPath, repoScaffoldPath].find((p) =>
      fs.existsSync(p),
    );
    const hasScaffold = candidatePath !== undefined;
    const scaffoldLooksValid =
      hasScaffold &&
      fs.existsSync(path.join(candidatePath!, "pubspec.yaml")) &&
      fs.existsSync(path.join(candidatePath!, "lib"));
    if (!scaffoldLooksValid) {
      // No committed template or a broken build-artifact dump (e.g. only
      // android/ios/build debris): use the toolchain so the app is always a
      // real Flutter project. Ensure managed SDK first.
      logger.info(
        `flutter: scaffold invalid/missing at ${candidatePath ?? "none"}, running flutter create for ${fullAppPath}`,
      );
      try {
        await ensureFlutterSdkAvailable((p) => {
          try {
            emit("flutter:toolchain:progress", p);
          } catch {}
        });
      } catch {}
      await createFlutterProjectViaToolchain(fullAppPath);
      return;
    }
    await copyDirectoryRecursive(candidatePath!, fullAppPath);
    // Additive pass so platform dirs (android/, ios/, ...) exist for builds
    // without clobbering the curated lib/, pubspec.yaml, or AI_RULES.md.
    try {
      await createFlutterProjectViaToolchain(fullAppPath);
    } catch (error) {
      logger.warn(
        `flutter create after template copy failed for ${fullAppPath}; platform dirs may be missing`,
        error,
      );
    }
    return;
  }

  if (templateId === "react" || templateId === "web3") {
    // Legacy web templates are not part of the Flutter product. Fall through
    // to the toolchain path so we never produce a React app unexpectedly; if a
    // template id is ever explicitly requested, surface it as an error instead
    // of silently scaffolding web code.
    throw new CaideError(
      `Template "${templateId}" is not supported. Caide builds Flutter apps only.`,
      CaideErrorKind.Validation,
    );
  }

  const template = await getTemplateOrThrow(templateId);
  if (!template.githubUrl) {
    throw new CaideError(`Template ${templateId} has no GitHub URL`, CaideErrorKind.External);
  }
  const repoCachePath = await cloneRepo(template.githubUrl);
  await copyRepoToApp(repoCachePath, fullAppPath);
}

async function cloneRepo(repoUrl: string): Promise<string> {
  const url = new URL(repoUrl);
  if (url.protocol !== "https:") {
    throw new CaideError("Repository URL must use HTTPS.", CaideErrorKind.External);
  }
  if (url.hostname !== "github.com") {
    throw new CaideError("Repository URL must be a github.com URL.", CaideErrorKind.Validation);
  }

  // Pathname will be like "/org/repo" or "/org/repo.git"
  const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

  if (pathParts.length !== 2) {
    throw new Error("Invalid repository URL format. Expected 'https://github.com/org/repo'");
  }

  const orgName = pathParts[0];
  const repoName = path.basename(pathParts[1], ".git"); // Remove .git suffix if present

  if (!orgName || !repoName) {
    // This case should ideally be caught by pathParts.length !== 2
    throw new Error("Failed to parse organization or repository name from URL.");
  }
  logger.info(`Parsed org: ${orgName}, repo: ${repoName} from ${repoUrl}`);

  const cachePath = path.join(app.getPath("userData"), "templates", orgName, repoName);

  if (fs.existsSync(cachePath)) {
    try {
      logger.info(
        `Repo ${repoName} already exists in cache at ${cachePath}. Checking for updates.`,
      );

      // Construct GitHub API URL
      const apiUrl = `https://api.github.com/repos/${orgName}/${repoName}/commits/HEAD`;
      logger.info(`Fetching remote SHA from ${apiUrl}`);

      // Use native fetch instead of isomorphic-git http.request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "User-Agent": "CAIDE-Mobile-Builder", // GitHub API requires this
          Accept: "application/vnd.github.v3+json",
        },
      });
      // Handle non-200 responses
      if (!response.ok) {
        throw new Error(
          `GitHub API request failed with status ${response.status}: ${response.statusText}`,
        );
      }
      // Parse JSON directly (fetch handles streaming internally)
      const commitData = (await response.json()) as { sha?: string };
      const remoteSha = commitData.sha;
      if (!remoteSha) {
        throw new CaideError("SHA not found in GitHub API response.", CaideErrorKind.NotFound);
      }

      logger.info(`Successfully fetched remote SHA: ${remoteSha}`);

      // Compare with local SHA
      const localSha = await getCurrentCommitHash({ path: cachePath });

      if (remoteSha === localSha) {
        logger.info(
          `Local cache for ${repoName} is up to date (SHA: ${localSha}). Skipping clone.`,
        );
        return cachePath;
      } else {
        logger.info(
          `Local cache for ${repoName} (SHA: ${localSha}) is outdated (Remote SHA: ${remoteSha}). Removing and re-cloning.`,
        );
        fs.rmSync(cachePath, { recursive: true, force: true });
        // Continue to clone…
      }
    } catch (err) {
      logger.warn(
        `Error checking for updates or comparing SHAs for ${repoName} at ${cachePath}. Will attempt to re-clone. Error: `,
        err,
      );
      return cachePath;
    }
  }

  fs.ensureDirSync(path.dirname(cachePath));

  logger.info(`Cloning ${repoUrl} to ${cachePath}`);
  try {
    await gitClone({ path: cachePath, url: repoUrl, depth: 1 });
    logger.info(`Successfully cloned ${repoUrl} to ${cachePath}`);
  } catch (err) {
    logger.error(`Failed to clone ${repoUrl} to ${cachePath}: `, err);
    throw err; // Re-throw the error after logging
  }
  return cachePath;
}

async function copyRepoToApp(repoCachePath: string, appPath: string) {
  logger.info(`Copying from ${repoCachePath} to ${appPath}`);
  try {
    await fs.copy(repoCachePath, appPath, {
      filter: (src, _dest) => {
        const excludedDirs = ["node_modules", ".git"];
        const relativeSrc = path.relative(repoCachePath, src);
        if (excludedDirs.includes(path.basename(relativeSrc))) {
          logger.info(`Excluding ${src} from copy`);
          return false;
        }
        return true;
      },
    });
    logger.info("Finished copying repository contents.");
  } catch (err) {
    logger.error(`Error copying repository from ${repoCachePath} to ${appPath}: `, err);
    throw err; // Re-throw the error after logging
  }
}
