// FILE: buildPipeline.ts
// Purpose: Pure build-mode tag pipeline (008-m9a). Applies a model response's
// XML file tags to the app workspace in donor order (deletes → renames →
// search-replace → copies → writes → generated tests), plus the dry-run
// search-replace check that powers the repair loop.
// Donor: dyad x caide src/ipc/processors/response_processor.ts
// (dryRunSearchReplace + the file-ops section of processFullResponseActions).
//
// Deliberately NOT ported here (owners: m9b wiring, 010, 012, 013):
// SQL execution, add-dependency, Supabase/Neon deploy, Neon timestamps,
// git add/commit, DB message updates, cloud-sandbox sync. This module touches
// only the workspace filesystem and reports what changed.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getCaideCopyTags,
  getCaideDeleteTags,
  getCaideGenerateTestTags,
  getCaideRenameTags,
  getCaideSearchReplaceTags,
  getCaideWriteTags,
} from "../../harness/utils/caideTagParser.ts";
import { safeJoinAppPath } from "./safePath.ts";
import { applySearchReplace } from "./searchReplaceProcessor.ts";

export interface BuildTagIssue {
  filePath: string;
  error: string;
}

export interface BuildPipelineError {
  message: string;
  error: unknown;
}

export interface BuildPipelineResult {
  writtenFiles: string[];
  renamedFiles: string[];
  deletedFiles: string[];
  hasChanges: boolean;
  errors: BuildPipelineError[];
}

/** Spec-file identity (donor TEST_SPEC_EXTENSIONS / SPEC_FILE_RE). */
const SPEC_FILE_RE = /\.spec\.(ts|tsx|js|jsx)$/;
const STRIPPABLE_EXT_RE = /\.(ts|tsx|js|jsx)$/;
const LAST_EXT_RE = /\.[^/.]+$/;

/**
 * Normalize a test path so it always lands under the app's `tests/` folder
 * with a spec extension (donor normalize_test_path.ts, verbatim logic).
 * Defense-in-depth: `..` segments resolve within the sanitized path, so the
 * result can never traverse out of `tests/`.
 */
export function normalizeTestPath(rawPath: string): string {
  const segments: string[] = [];
  for (const segment of rawPath.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const sanitized = segments.join("/");

  if (!sanitized || sanitized === "tests") {
    return "tests/generated.spec.ts";
  }

  let specPath = sanitized;
  if (!SPEC_FILE_RE.test(specPath)) {
    const withoutKnownExt = specPath.replace(STRIPPABLE_EXT_RE, "");
    specPath = `${withoutKnownExt === specPath ? specPath.replace(LAST_EXT_RE, "") : withoutKnownExt}.spec.ts`;
  }
  if (specPath.startsWith("tests/")) return specPath;
  return `tests/${specPath}`;
}

/**
 * Dry-run every search-replace tag against the workspace without writing.
 * Returns per-file issues (missing target, unappliable diff). Donor
 * dryRunSearchReplace verbatim, minus logging.
 */
export async function dryRunSearchReplaceTags(
  fullResponse: string,
  appPath: string,
): Promise<BuildTagIssue[]> {
  const issues: BuildTagIssue[] = [];
  for (const tag of getCaideSearchReplaceTags(fullResponse)) {
    const filePath = tag.path;
    let fullFilePath: string;
    try {
      fullFilePath = safeJoinAppPath(appPath, filePath);
    } catch (error) {
      issues.push({ filePath, error: error?.toString() ?? "Unknown error" });
      continue;
    }
    try {
      if (!fs.existsSync(fullFilePath)) {
        issues.push({
          filePath,
          error: `Search-replace target file does not exist: ${filePath}`,
        });
        continue;
      }
      const original = await fs.promises.readFile(fullFilePath, "utf8");
      const result = applySearchReplace(original, tag.content);
      if (!result.success || typeof result.content !== "string") {
        issues.push({
          filePath,
          error: "Unable to apply search-replace to file because: " + result.error,
        });
      }
    } catch (error) {
      issues.push({ filePath, error: error?.toString() ?? "Unknown error" });
    }
  }
  return issues;
}

/**
 * Apply every file tag in a build response to the workspace. Donor file-ops
 * order (deletes → renames → search-replace → copies → writes → tests).
 * Search-replace misses are skipped silently (donor: a write tag or a later
 * tag is expected to fix them); copies/writes/renames record per-file
 * errors and continue. Unsafe paths are recorded, never thrown.
 */
export async function applyBuildResponseTags(
  fullResponse: string,
  appPath: string,
): Promise<BuildPipelineResult> {
  const writtenFiles: string[] = [];
  const renamedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const errors: BuildPipelineError[] = [];

  // 1. Deletes first (avoids path conflicts before other operations).
  for (const filePath of getCaideDeleteTags(fullResponse)) {
    let fullFilePath: string;
    try {
      fullFilePath = safeJoinAppPath(appPath, filePath);
    } catch (error) {
      errors.push({ message: `Refusing to delete unsafe path: ${filePath}`, error });
      continue;
    }
    try {
      if (!fs.existsSync(fullFilePath)) continue;
      if (fs.lstatSync(fullFilePath).isDirectory()) {
        fs.rmSync(fullFilePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullFilePath);
      }
      deletedFiles.push(filePath);
    } catch (error) {
      errors.push({ message: `Failed to delete file: ${filePath}`, error });
    }
  }

  // 2. Renames (LLMs like to rename and then edit the same file).
  for (const tag of getCaideRenameTags(fullResponse)) {
    let fromPath: string;
    let toPath: string;
    try {
      fromPath = safeJoinAppPath(appPath, tag.from);
      toPath = safeJoinAppPath(appPath, tag.to);
    } catch (error) {
      errors.push({ message: `Refusing to rename unsafe path: ${tag.from} -> ${tag.to}`, error });
      continue;
    }
    try {
      if (!fs.existsSync(fromPath)) continue;
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.renameSync(fromPath, toPath);
      renamedFiles.push(tag.to);
    } catch (error) {
      errors.push({ message: `Failed to rename ${tag.from} to ${tag.to}`, error });
    }
  }

  // 3. Search-replace edits (misses skipped: a write tag fixes them).
  for (const tag of getCaideSearchReplaceTags(fullResponse)) {
    let fullFilePath: string;
    try {
      fullFilePath = safeJoinAppPath(appPath, tag.path);
    } catch (error) {
      errors.push({ message: `Refusing search-replace on unsafe path: ${tag.path}`, error });
      continue;
    }
    try {
      if (!fs.existsSync(fullFilePath)) continue;
      const original = await fs.promises.readFile(fullFilePath, "utf8");
      const result = applySearchReplace(original, tag.content);
      if (!result.success || typeof result.content !== "string") continue;
      fs.writeFileSync(fullFilePath, result.content);
      writtenFiles.push(tag.path);
    } catch (error) {
      errors.push({ message: `Error applying search-replace to ${tag.path}`, error });
    }
  }

  // 4. Copies.
  for (const tag of getCaideCopyTags(fullResponse)) {
    let fromPath: string;
    let toPath: string;
    try {
      fromPath = safeJoinAppPath(appPath, tag.from);
      toPath = safeJoinAppPath(appPath, tag.to);
    } catch (error) {
      errors.push({ message: `Refusing to copy unsafe path: ${tag.from} to ${tag.to}`, error });
      continue;
    }
    try {
      if (!fs.existsSync(fromPath)) {
        errors.push({
          message: `Failed to copy ${tag.from} to ${tag.to}`,
          error: `Copy source does not exist: ${tag.from}`,
        });
        continue;
      }
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.cpSync(fromPath, toPath, { recursive: true });
      writtenFiles.push(tag.to);
    } catch (error) {
      errors.push({ message: `Failed to copy ${tag.from} to ${tag.to}`, error });
    }
  }

  // 5. Writes.
  for (const tag of getCaideWriteTags(fullResponse)) {
    let fullFilePath: string;
    try {
      fullFilePath = safeJoinAppPath(appPath, tag.path);
    } catch (error) {
      errors.push({ message: `Refusing to write unsafe path: ${tag.path}`, error });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });
      fs.writeFileSync(fullFilePath, tag.content);
      writtenFiles.push(tag.path);
    } catch (error) {
      errors.push({ message: `Failed to write file: ${tag.path}`, error });
    }
  }

  // 6. Generated tests: plain writes forced under tests/ (defense-in-depth),
  // with dedupe counters so sibling tags can't clobber each other.
  const writtenTestPaths = new Set<string>();
  for (const tag of getCaideGenerateTestTags(fullResponse)) {
    let filePath = normalizeTestPath(tag.path);
    const basePath = filePath;
    for (let n = 2; writtenTestPaths.has(filePath); n++) {
      filePath = basePath.replace(SPEC_FILE_RE, `-${n}.spec.$1`);
    }
    writtenTestPaths.add(filePath);
    let fullFilePath: string;
    try {
      fullFilePath = safeJoinAppPath(appPath, filePath);
    } catch (error) {
      errors.push({ message: `Refusing to write unsafe test path: ${filePath}`, error });
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });
      fs.writeFileSync(fullFilePath, tag.content);
      writtenFiles.push(filePath);
    } catch (error) {
      errors.push({ message: `Failed to write test file: ${filePath}`, error });
    }
  }

  return {
    writtenFiles,
    renamedFiles,
    deletedFiles,
    hasChanges: writtenFiles.length > 0 || renamedFiles.length > 0 || deletedFiles.length > 0,
    errors,
  };
}
