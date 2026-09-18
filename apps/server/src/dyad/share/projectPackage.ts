// FILE: projectPackage.ts
// Purpose: CAIDEPKG project export/inspect/import (workspace + git history
// + file-backed project state round-trip).
// Donor: dyad x caide src/ipc/services/project_package_service.ts —
// archive format, exclusion/secret rules, git-bundle flow, and security
// report semantics verbatim; adaptations: appPath-direct API (no numeric
// app DB ids), git via dyad/vcs runGit (no dugite), file-backed state
// (.caide/versions.jsonl, goals/, APP_MEMORY.md, decisions.jsonl) travels
// as ordinary files. SQLite projection threads are NOT rehydrated here —
// recorded follow-up (needs Effect service access + ID remapping); the
// manifest still carries chat counts for the inspector.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { runGit } from "../vcs/gitTools.ts";
import {
  DEFAULT_PACKAGE_LIMITS,
  readProjectArchive,
  sha256File,
  writeProjectArchive,
  type ArchiveFileInput,
  type JsonValue,
} from "./projectPackageArchive.ts";
import {
  CAIDE_PACKAGE_EXTENSION,
  CAIDE_PACKAGE_FORMAT,
  CAIDE_PACKAGE_VERSION,
  ProjectPackageManifestSchema,
  type ProjectPackageInspection,
  type ProjectPackageManifest,
  type ProjectPackageMetadata,
  type ProjectPackageSecurityReport,
} from "./projectPackageManifest.ts";

export class ProjectPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPackageError";
  }
}

/** Operational state that travels with the package (file-backed stores). */
const CAIDE_STATE_PATHS = [
  ".caide/versions.jsonl",
  ".caide/APP_MEMORY.md",
  ".caide/decisions.jsonl",
];

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /(?:^|\.)credentials?(?:\.|$)/i,
  /(?:^|\.)secrets?(?:\.|$)/i,
  /(?:^|\.)service-account(?:\.|$)/i,
  /^(?:\.npmrc|\.yarnrc|\.pypirc|\.netrc|auth\.json)$/i,
  /^serviceaccount(?:[-_.].+)?\.json$/i,
  /(?:^|\.)id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /\.(?:pem|p12|pfx|key|keystore|jks)$/i,
];

const ALLOWED_ENV_EXAMPLES = new Set([".env.example", ".env.sample", ".env.template"]);

function sanitizeProjectName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>"\/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return normalized || "received-project";
}

function isSecretFile(relativePath: string): boolean {
  const name = path.posix.basename(relativePath).toLowerCase();
  if (ALLOWED_ENV_EXAMPLES.has(name)) return false;
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function newSecurityReport(): ProjectPackageSecurityReport {
  return { excludedFiles: [], excludedDirectories: [], skippedSymlinks: [], warnings: [] };
}

async function collectWorkspaceFiles(
  root: string,
  securityReport: ProjectPackageSecurityReport,
): Promise<ArchiveFileInput[]> {
  const files: ArchiveFileInput[] = [];
  let totalBytes = 0;
  const visit = async (directory: string, relativeDirectory = "") => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        securityReport.skippedSymlinks.push(relative);
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          securityReport.excludedDirectories.push(relative);
          continue;
        }
        await visit(absolute, relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSecretFile(relative)) {
        securityReport.excludedFiles.push(relative);
        continue;
      }
      const stat = await fs.promises.stat(absolute);
      if (stat.size > DEFAULT_PACKAGE_LIMITS.maxFileBytes) {
        throw new ProjectPackageError(`Project file exceeds the package limit: ${relative}`);
      }
      totalBytes += stat.size;
      if (totalBytes > DEFAULT_PACKAGE_LIMITS.maxUncompressedBytes) {
        throw new ProjectPackageError("Project exceeds the package size limit");
      }
      if (files.length + 1 > DEFAULT_PACKAGE_LIMITS.maxFiles) {
        throw new ProjectPackageError("Project contains too many files to package safely");
      }
      files.push({
        archivePath: `workspace/${relative}`,
        sourcePath: absolute,
        size: stat.size,
        sha256: await sha256File(absolute),
      });
    }
  };
  await visit(root);
  return files;
}

async function createGitBundle(
  appPath: string,
  tempDirectory: string,
): Promise<ArchiveFileInput | undefined> {
  if (!fs.existsSync(path.join(appPath, ".git"))) return undefined;
  const bundlePath = path.join(tempDirectory, "repository.bundle");
  const result = await runGit(["bundle", "create", bundlePath, "--all"], appPath).catch(
    () => null,
  );
  if (!result || result.exitCode !== 0) return undefined;
  const stat = await fs.promises.stat(bundlePath);
  return {
    archivePath: "repository.bundle",
    sourcePath: bundlePath,
    size: stat.size,
    sha256: await sha256File(bundlePath),
  };
}

async function collectCaideStateFiles(
  appPath: string,
  securityReport: ProjectPackageSecurityReport,
): Promise<ArchiveFileInput[]> {
  const files: ArchiveFileInput[] = [];
  // Whole goals/ + evidence trees (bounded by the archive limits).
  const trees = [".caide/goals", ".caide/evidence"];
  for (const tree of trees) {
    const root = path.join(appPath, tree);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true, recursive: true } as never);
    } catch {
      continue;
    }
    for (const entry of entries as fs.Dirent[]) {
      if (!entry.isFile()) continue;
      const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
      const relative = path.relative(appPath, absolute).replaceAll("\\", "/");
      if (isSecretFile(relative)) {
        securityReport.excludedFiles.push(relative);
        continue;
      }
      const stat = await fs.promises.stat(absolute);
      files.push({
        archivePath: `workspace/${relative}`,
        sourcePath: absolute,
        size: stat.size,
        sha256: await sha256File(absolute),
      });
    }
  }
  for (const rel of CAIDE_STATE_PATHS) {
    const absolute = path.join(appPath, rel);
    try {
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile()) continue;
      files.push({
        archivePath: `workspace/${rel}`,
        sourcePath: absolute,
        size: stat.size,
        sha256: await sha256File(absolute),
      });
    } catch {
      // optional state file absent
    }
  }
  return files;
}

export interface ExportProjectPackageParams {
  appPath: string;
  projectName: string;
  destination?: string;
  includeGitHistory?: boolean;
}

export interface ExportProjectPackageResult {
  path: string;
  manifest: ProjectPackageManifest;
  securityReport: ProjectPackageSecurityReport;
}

export interface InspectProjectPackageResult extends ProjectPackageInspection {}

export interface ImportProjectPackageParams {
  packagePath: string;
  workspaceRoot: string;
  projectName?: string;
}

export interface ImportProjectPackageResult {
  appPath: string;
  projectName: string;
  gitRestored: boolean;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function exportProjectPackage(
  params: ExportProjectPackageParams,
): Promise<ExportProjectPackageResult> {
  const stat = await fs.promises.stat(params.appPath).catch(() => null);
  if (!stat?.isDirectory()) throw new ProjectPackageError("Project workspace is unavailable");
  const securityReport = newSecurityReport();
  const tempDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "caide-project-package-"),
  );
  try {
    const files = await collectWorkspaceFiles(params.appPath, securityReport);
    const stateFiles = await collectCaideStateFiles(params.appPath, securityReport);
    // .caide operational files travel even though scaffolds gitignore them
    // (the package is the portable channel; git is not).
    const seen = new Set(files.map((f) => f.archivePath));
    for (const f of stateFiles) {
      if (!seen.has(f.archivePath)) {
        seen.add(f.archivePath);
        files.push(f);
      }
    }
    let gitHistory = false;
    if (params.includeGitHistory !== false) {
      const bundle = await createGitBundle(params.appPath, tempDirectory);
      if (bundle) {
        files.push(bundle);
        gitHistory = true;
      }
    }
    const manifest: ProjectPackageManifest = ProjectPackageManifestSchema.parse({
      format: CAIDE_PACKAGE_FORMAT,
      formatVersion: CAIDE_PACKAGE_VERSION,
      projectId: crypto.randomUUID(),
      projectName: sanitizeProjectName(params.projectName),
      caideVersion: "v2-transplant",
      createdAt: new Date().toISOString(),
      includes: { workspace: true, gitHistory, chatHistory: false, media: true },
      limits: {
        fileCount: files.length,
        uncompressedBytes: files.reduce((n, f) => n + f.size, 0),
      },
    });
    const metadata: ProjectPackageMetadata = {
      app: { path: params.appPath, name: params.projectName },
      chats: [],
      messages: [],
      versions: [],
      securityReport,
    };
    const destination =
      params.destination ??
      path.join(
        os.tmpdir(),
        `${sanitizeProjectName(params.projectName)}${CAIDE_PACKAGE_EXTENSION}`,
      );
    await writeProjectArchive({
      destination,
      json: {
        manifest: toJsonValue(manifest),
        metadata: toJsonValue(metadata),
      },
      files,
    });
    return { path: destination, manifest, securityReport };
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function inspectProjectPackage(
  packagePath: string,
): Promise<InspectProjectPackageResult> {
  const stat = await fs.promises.stat(packagePath);
  let manifest: ProjectPackageManifest | null = null;
  let metadata: ProjectPackageMetadata | null = null;
  await readProjectArchive(packagePath, {
    onJson: (name, value) => {
      if (name === "manifest") manifest = ProjectPackageManifestSchema.parse(value);
      if (name === "metadata") metadata = value as unknown as ProjectPackageMetadata;
    },
  });
  if (!manifest) throw new ProjectPackageError("Package has no manifest");
  const checksum = await sha256File(packagePath);
  return {
    path: packagePath,
    sizeBytes: stat.size,
    checksum,
    manifest,
    chatCount: metadata?.chats.length ?? 0,
    messageCount: metadata?.messages.length ?? 0,
    versionCount: metadata?.versions.length ?? 0,
    securityReport: metadata?.securityReport ?? newSecurityReport(),
  };
}

export async function importProjectPackage(
  params: ImportProjectPackageParams,
): Promise<ImportProjectPackageResult> {
  const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), "caide-project-import-"));
  let manifest: ProjectPackageManifest | null = null;
  try {
    await readProjectArchive(params.packagePath, {
      destinationDirectory: staging,
      onJson: (name, value) => {
        if (name === "manifest") manifest = ProjectPackageManifestSchema.parse(value);
      },
    });
    if (!manifest) throw new ProjectPackageError("Package has no manifest");
    const projectName = sanitizeProjectName(
      params.projectName ?? (manifest as ProjectPackageManifest).projectName,
    );
    const destination = path.join(params.workspaceRoot, projectName);
    if (fs.existsSync(destination)) {
      throw new ProjectPackageError(`Import destination already exists: ${destination}`);
    }
    const bundlePath = path.join(staging, "repository.bundle");
    let gitRestored = false;
    if (fs.existsSync(bundlePath)) {
      await fs.promises.mkdir(params.workspaceRoot, { recursive: true });
      const result = await runGit(["clone", "--", bundlePath, destination], ".").catch(
        () => null,
      );
      if (!result || result.exitCode !== 0) {
        throw new ProjectPackageError("Failed to restore Git history from the package bundle");
      }
      gitRestored = true;
    } else {
      await fs.promises.mkdir(destination, { recursive: true });
    }
    const workspaceRoot = path.join(staging, "workspace");
    if (fs.existsSync(workspaceRoot)) {
      if (gitRestored) {
        // Clear everything except .git, then overlay.
        const existing = await fs.promises.readdir(destination, { withFileTypes: true });
        await Promise.all(
          existing
            .filter((e) => e.name !== ".git")
            .map((e) => fs.promises.rm(path.join(destination, e.name), { recursive: true, force: true })),
        );
      }
      await copyDirectoryRecursive(workspaceRoot, destination);
    }
    return { appPath: destination, projectName, gitRestored };
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true });
  }
}

async function copyDirectoryRecursive(source: string, destination: string): Promise<void> {
  await fs.promises.mkdir(destination, { recursive: true });
  const entries = await fs.promises.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(from, to);
    } else if (entry.isFile()) {
      await fs.promises.copyFile(from, to);
    }
  }
}
