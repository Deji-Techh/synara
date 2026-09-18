// FILE: supabaseDeploy.ts
// Purpose: Supabase edge-function deploy pipeline (affected-module graph,
// bundle/activate phases, dangling prune, progress events).
// Donor: dyad x caide src/supabase_admin/supabase_utils.ts (orchestration +
// _shared impact graph verbatim) + supabase_deploy_queue.ts (concurrency
// rules verbatim) — adaptations: plain Errors (no DyadError/Electron log);
// remote calls injected via SupabaseDeployDeps (decouples the pipeline from
// the OAuth management client — V2 PAT wiring lands in 013; the queue +
// graph + progress contract ship here per 012 §3).

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

export const SUPABASE_BUNDLE_ONLY_DEPLOY_CONCURRENCY = 4;
export const SUPABASE_ACTIVATING_DEPLOY_CONCURRENCY = 1;

// ── Deploy queue (donor supabase_deploy_queue.ts verbatim) ──

type QueueTask<T> = {
  operation: () => Promise<T>;
  bundleOnly: boolean;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

class SupabaseDeployQueue {
  private activeBundleOnlyCount = 0;
  private activeActivatingCount = 0;
  private readonly pendingTasks: QueueTask<unknown>[] = [];

  enqueue<T>(bundleOnly: boolean, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendingTasks.push({
        operation,
        bundleOnly,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain() {
    while (this.pendingTasks.length > 0) {
      const task = this.pendingTasks[0];
      if (!task || !this.canStart(task)) return;
      this.pendingTasks.shift();
      this.incrementActiveCount(task);
      void this.runTask(task);
    }
  }

  private canStart(task: QueueTask<unknown>) {
    if (task.bundleOnly) {
      return (
        this.activeActivatingCount === 0 &&
        this.activeBundleOnlyCount < SUPABASE_BUNDLE_ONLY_DEPLOY_CONCURRENCY
      );
    }
    return (
      this.activeActivatingCount < SUPABASE_ACTIVATING_DEPLOY_CONCURRENCY &&
      this.activeBundleOnlyCount === 0
    );
  }

  private incrementActiveCount(task: QueueTask<unknown>) {
    if (task.bundleOnly) this.activeBundleOnlyCount++;
    else this.activeActivatingCount++;
  }

  private decrementActiveCount(task: QueueTask<unknown>) {
    if (task.bundleOnly) this.activeBundleOnlyCount--;
    else this.activeActivatingCount--;
  }

  private async runTask(task: QueueTask<unknown>) {
    try {
      task.resolve(await task.operation());
    } catch (error) {
      task.reject(error);
    } finally {
      this.decrementActiveCount(task);
      this.drain();
    }
  }
}

const deployQueuesByProject = new Map<string, SupabaseDeployQueue>();

export function enqueueSupabaseDeploy<T>(
  supabaseProjectId: string,
  bundleOnly: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  let queue = deployQueuesByProject.get(supabaseProjectId);
  if (!queue) {
    queue = new SupabaseDeployQueue();
    deployQueuesByProject.set(supabaseProjectId, queue);
  }
  return queue.enqueue(bundleOnly, operation);
}

export function resetSupabaseDeployQueuesForTests() {
  deployQueuesByProject.clear();
}

// ── Remote-call seam (PAT wiring lands in 013) ──

export interface SupabaseDeployedFunction {
  slug: string;
}

export interface SupabaseDeployDeps {
  bundleFunction(input: {
    projectId: string;
    functionName: string;
    appPath: string;
    organizationSlug: string | null;
  }): Promise<SupabaseDeployedFunction>;
  activateFunctions(input: {
    projectId: string;
    functions: SupabaseDeployedFunction[];
    organizationSlug: string | null;
  }): Promise<void>;
  listFunctions(input: {
    projectId: string;
    organizationSlug: string | null;
  }): Promise<SupabaseDeployedFunction[]>;
  deleteFunction(input: {
    projectId: string;
    functionName: string;
    organizationSlug: string | null;
  }): Promise<void>;
}

// ── Progress + impact types (donor verbatim) ──

export interface SupabaseDeployProgress {
  phase: "deploying" | "finished" | "failed";
  total: number;
  active: number;
  queued: number;
  completed: number;
  succeeded: number;
  failed: number;
  functionName?: string;
}

export async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: Array<PromiseSettledResult<R> | undefined> = Array.from({
    length: items.length,
  });
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await mapper(item as T, currentIndex),
        };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.map((result) => result as PromiseSettledResult<R>);
}

/** `[name] message` log prefix → function name (donor verbatim). */
export function extractFunctionName(eventMessage: string): string | undefined {
  const match = eventMessage.match(/^\[([^\]]+)\]/);
  return match?.[1];
}

/** Inside supabase/functions/ but NOT in _shared/. */
export function isServerFunction(filePath: string): boolean {
  return (
    filePath.startsWith("supabase/functions/") &&
    !filePath.startsWith("supabase/functions/_shared/")
  );
}

/** Inside supabase/functions/_shared/. */
export function isSharedServerModule(filePath: string): boolean {
  return filePath.startsWith("supabase/functions/_shared/");
}

/**
 * Donor extractFunctionNameFromPath parity:
 * "supabase/functions/hello/lib/utils.ts" → "hello".
 */
export function extractFunctionNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/^supabase\/functions\/([^/]+)/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Supabase function path: ${filePath}. Expected format: supabase/functions/{functionName}/...`,
    );
  }
  const functionName = match[1];
  if (functionName.startsWith("_")) {
    throw new Error(
      `Invalid Supabase function path: ${filePath}. Function names starting with "_" are reserved for special directories.`,
    );
  }
  return functionName;
}

export type SupabaseFunctionImpact =
  | { kind: "partial"; functionNames: string[] }
  | { kind: "all"; reason: string };

const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

const RESOLUTION_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isPathWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function getValidSupabaseFunctionNames(functionsDir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(functionsDir, { withFileTypes: true });
  const validFunctions: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const indexPath = path.join(functionsDir, entry.name, "index.ts");
    try {
      await fs.promises.access(indexPath);
      validFunctions.push(entry.name);
    } catch {
      // skip: no entrypoint
    }
  }
  return validFunctions;
}

type TypeScriptApi = typeof import("typescript");

function loadAppTypeScript(appPath: string): TypeScriptApi | null {
  try {
    const require = createRequire(import.meta.url);
    const tsPath = require.resolve("typescript", { paths: [appPath] });
    return require(tsPath) as TypeScriptApi;
  } catch {
    return null;
  }
}

function scriptKindForPath(ts: TypeScriptApi, filePath: string) {
  switch (path.extname(filePath)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function isClearlyExternalSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("npm:") ||
    specifier.startsWith("jsr:") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("http://") ||
    specifier.startsWith("https://") ||
    specifier.startsWith("@supabase/")
  );
}

async function resolveLocalImport({
  fromFile,
  specifier,
  functionsDir,
}: {
  fromFile: string;
  specifier: string;
  functionsDir: string;
}): Promise<string | SupabaseFunctionImpact> {
  const resolvedBase = path.resolve(path.dirname(fromFile), specifier);
  if (!isPathWithin(functionsDir, resolvedBase)) {
    return { kind: "all", reason: `relative_import_outside_supabase_functions:${specifier}` };
  }
  const ext = path.extname(resolvedBase);
  const candidates =
    ext.length > 0
      ? [resolvedBase]
      : [
          resolvedBase,
          ...RESOLUTION_EXTENSIONS.map((candidateExt) => resolvedBase + candidateExt),
          ...RESOLUTION_EXTENSIONS.map((candidateExt) =>
            path.join(resolvedBase, `index${candidateExt}`),
          ),
        ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(candidate);
      if (stat.isFile()) {
        if (!isPathWithin(functionsDir, candidate)) {
          return {
            kind: "all",
            reason: `resolved_import_outside_supabase_functions:${specifier}`,
          };
        }
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }
  return { kind: "all", reason: `unresolved_relative_import:${specifier}` };
}

async function collectLocalDependencies({
  ts,
  filePath,
  functionsDir,
}: {
  ts: TypeScriptApi;
  filePath: string;
  functionsDir: string;
}): Promise<string[] | SupabaseFunctionImpact> {
  let sourceText: string;
  try {
    sourceText = await fs.promises.readFile(filePath, "utf8");
  } catch {
    return { kind: "all", reason: `unable_to_read_source:${filePath}` };
  }
  let sourceFile: import("typescript").SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(ts, filePath),
    );
  } catch {
    return { kind: "all", reason: `parse_failure:${filePath}` };
  }
  const specifiers: string[] = [];
  let unsafeReason: string | undefined;
  function addSpecifier(specifierNode: import("typescript").Expression) {
    if (ts.isStringLiteralLike(specifierNode)) {
      specifiers.push(specifierNode.text);
    } else {
      unsafeReason = `non_literal_dynamic_import:${filePath}`;
    }
  }
  function visit(node: import("typescript").Node): void {
    if (unsafeReason) return;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      addSpecifier(node.moduleSpecifier);
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (!specifier) {
        unsafeReason = `missing_dynamic_import_specifier:${filePath}`;
        return;
      }
      addSpecifier(specifier);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      unsafeReason = `commonjs_require:${filePath}`;
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      unsafeReason = `import_equals_require:${filePath}`;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (unsafeReason) return { kind: "all", reason: unsafeReason };
  const dependencies: string[] = [];
  for (const specifier of specifiers) {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const resolved = await resolveLocalImport({ fromFile: filePath, specifier, functionsDir });
      if (typeof resolved !== "string") return resolved;
      dependencies.push(resolved);
      continue;
    }
    if (!isClearlyExternalSpecifier(specifier)) {
      return { kind: "all", reason: `unknown_bare_specifier:${specifier}` };
    }
  }
  return dependencies;
}

/**
 * Donor getSupabaseFunctionsAffectedBySharedModules parity: walks each
 * function entrypoint's local import graph (TS AST) to find consumers of
 * changed _shared modules; any unsafe shape falls back to all.
 */
export async function getSupabaseFunctionsAffectedBySharedModules({
  appPath,
  changedSharedModulePaths,
}: {
  appPath: string;
  changedSharedModulePaths: string[];
}): Promise<SupabaseFunctionImpact> {
  const functionsDir = path.join(appPath, "supabase", "functions");
  try {
    await fs.promises.access(functionsDir);
  } catch {
    return { kind: "partial", functionNames: [] };
  }
  const ts = loadAppTypeScript(appPath);
  if (!ts) return { kind: "all", reason: "typescript_not_installed" };
  const changedSharedPaths = new Set<string>();
  for (const changedPath of changedSharedModulePaths) {
    const normalized = normalizeRelativePath(changedPath);
    const ext = path.extname(normalized);
    if (!SUPPORTED_SOURCE_EXTENSIONS.has(ext)) {
      return { kind: "all", reason: `unsupported_changed_shared_path:${changedPath}` };
    }
    const absolutePath = path.resolve(appPath, normalized);
    if (!isPathWithin(functionsDir, absolutePath)) {
      return { kind: "all", reason: `changed_shared_path_outside_functions:${changedPath}` };
    }
    try {
      const stat = await fs.promises.stat(absolutePath);
      if (stat.isDirectory()) {
        return { kind: "all", reason: `changed_shared_directory:${changedPath}` };
      }
    } catch {
      // Deleted/renamed files may not exist; unresolved imports force fallback.
    }
    changedSharedPaths.add(absolutePath);
  }
  if (changedSharedPaths.size === 0) return { kind: "partial", functionNames: [] };
  let validFunctions: string[];
  try {
    validFunctions = await getValidSupabaseFunctionNames(functionsDir);
  } catch {
    return { kind: "all", reason: "unable_to_enumerate_functions" };
  }
  const dependencyCache = new Map<string, string[]>();
  const affectedFunctionNames: string[] = [];
  for (const functionName of validFunctions) {
    const entrypoint = path.join(functionsDir, functionName, "index.ts");
    const visited = new Set<string>();
    const stack = [entrypoint];
    let affected = false;
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      if (changedSharedPaths.has(current)) {
        affected = true;
        break;
      }
      let dependencies = dependencyCache.get(current);
      if (!dependencies) {
        const collected = await collectLocalDependencies({ ts, filePath: current, functionsDir });
        if (!Array.isArray(collected)) return collected;
        dependencies = collected;
        dependencyCache.set(current, dependencies);
      }
      for (const dependency of dependencies) {
        if (!visited.has(dependency)) stack.push(dependency);
      }
    }
    if (affected) affectedFunctionNames.push(functionName);
  }
  return { kind: "partial", functionNames: affectedFunctionNames };
}

export interface SupabaseDeployArgs {
  appPath: string;
  projectId: string;
  organizationSlug: string | null;
  skipPruneEdgeFunctions: boolean;
  functionNames?: string[];
  onProgress?: (progress: SupabaseDeployProgress) => void;
  deps: SupabaseDeployDeps;
}

/**
 * Donor deploySupabaseFunctions parity: bundle phase (concurrency 4) →
 * single bulk activation → dangling prune → finished/failed progress.
 * Returns error strings (empty when clean).
 */
export async function deploySupabaseFunctions(
  args: SupabaseDeployArgs,
): Promise<string[]> {
  const { appPath, projectId, organizationSlug, skipPruneEdgeFunctions, onProgress, deps } = args;
  const functionsDir = path.join(appPath, "supabase", "functions");
  try {
    await fs.promises.access(functionsDir);
  } catch {
    return [];
  }
  const errors: string[] = [];
  try {
    const allValidFunctions = await getValidSupabaseFunctionNames(functionsDir);
    const allValidFunctionNames = new Set(allValidFunctions);
    const requestedFunctionNames = args.functionNames
      ? Array.from(new Set(args.functionNames))
      : undefined;
    const missingRequestedFunctionNames: string[] = [];
    const validFunctions = requestedFunctionNames
      ? requestedFunctionNames.filter((functionName) => {
          if (allValidFunctionNames.has(functionName)) return true;
          missingRequestedFunctionNames.push(functionName);
          return false;
        })
      : allValidFunctions;
    if (missingRequestedFunctionNames.length > 0) {
      errors.push(
        `Requested Supabase functions do not exist locally or are missing index.ts: ${missingRequestedFunctionNames.join(", ")}`,
      );
    }
    if (validFunctions.length === 0) {
      if (!requestedFunctionNames || errors.length > 0) return errors;
      return errors;
    }
    const totalFunctions = validFunctions.length;
    let activeFunctions = 0;
    let completedFunctions = 0;
    let succeededFunctions = 0;
    let failedFunctions = 0;
    function emitProgress(phase: SupabaseDeployProgress["phase"], functionName?: string) {
      onProgress?.({
        phase,
        total: totalFunctions,
        active: activeFunctions,
        queued: totalFunctions - activeFunctions - completedFunctions,
        completed: completedFunctions,
        succeeded: succeededFunctions,
        failed: failedFunctions,
        functionName,
      });
    }
    emitProgress("deploying");
    const deployResults = await mapSettledWithConcurrency(
      validFunctions,
      SUPABASE_BUNDLE_ONLY_DEPLOY_CONCURRENCY,
      async (functionName) => {
        activeFunctions++;
        emitProgress("deploying", functionName);
        try {
          const result = await deps.bundleFunction({
            projectId,
            functionName,
            appPath,
            organizationSlug,
          });
          succeededFunctions++;
          return result;
        } catch (error) {
          failedFunctions++;
          throw error;
        } finally {
          activeFunctions--;
          completedFunctions++;
          emitProgress("deploying", functionName);
        }
      },
    );
    const successfulDeploys: SupabaseDeployedFunction[] = [];
    for (let i = 0; i < deployResults.length; i++) {
      const result = deployResults[i];
      const functionName = validFunctions[i];
      if (result?.status === "fulfilled") {
        successfulDeploys.push(result.value);
      } else {
        const reason =
          result?.status === "rejected"
            ? (result.reason as Error)?.message || result.reason
            : "unknown";
        errors.push(`Failed to bundle ${functionName}: ${reason}`);
      }
    }
    const activationSucceeded = successfulDeploys.length > 0;
    if (successfulDeploys.length > 0) {
      try {
        await deps.activateFunctions({
          projectId,
          functions: successfulDeploys,
          organizationSlug,
        });
      } catch (error: unknown) {
        errors.push(
          `Failed to bulk update functions: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (!skipPruneEdgeFunctions) {
      try {
        const deployedFunctions = await deps.listFunctions({ projectId, organizationSlug });
        const localFunctionNames = new Set(allValidFunctions);
        const danglingFunctions = deployedFunctions.filter(
          (fn) => !localFunctionNames.has(fn.slug),
        );
        for (const fn of danglingFunctions) {
          try {
            await deps.deleteFunction({
              projectId,
              functionName: fn.slug,
              organizationSlug,
            });
          } catch (deleteError: unknown) {
            errors.push(
              `Failed to prune edge function ${fn.slug}: ${deleteError instanceof Error ? deleteError.message : deleteError}`,
            );
          }
        }
      } catch (pruneError: unknown) {
        errors.push(
          `Failed to check for dangling edge functions: ${pruneError instanceof Error ? pruneError.message : pruneError}`,
        );
      }
    }
    emitProgress(errors.length === 0 && activationSucceeded ? "finished" : "failed");
  } catch (error: unknown) {
    errors.push(
      `Error reading functions directory: ${error instanceof Error ? error.message : error}`,
    );
  }
  return errors;
}

/** Donor deployAllSupabaseFunctions parity. */
export async function deployAllSupabaseFunctions(
  args: Omit<SupabaseDeployArgs, "functionNames">,
): Promise<string[]> {
  return deploySupabaseFunctions(args);
}

/**
 * Donor deployAffectedSupabaseFunctions parity: shared-module impact first
 * (partial → named set + pending; unsafe → all), else pending set only.
 */
export async function deployAffectedSupabaseFunctions(
  args: Omit<SupabaseDeployArgs, "functionNames"> & {
    sharedModulesChanged: boolean;
    changedSharedModulePaths: string[];
    pendingFunctionDeploys: string[];
  },
): Promise<string[]> {
  const { sharedModulesChanged, changedSharedModulePaths, pendingFunctionDeploys, ...rest } = args;
  if (sharedModulesChanged) {
    const impact =
      changedSharedModulePaths.length > 0
        ? await getSupabaseFunctionsAffectedBySharedModules({
            appPath: args.appPath,
            changedSharedModulePaths,
          })
        : ({ kind: "all", reason: "changed_shared_paths_missing" } as const);
    if (impact.kind === "partial") {
      const functionNames = Array.from(
        new Set([...impact.functionNames, ...pendingFunctionDeploys]),
      );
      return deploySupabaseFunctions({ ...rest, functionNames });
    }
    return deployAllSupabaseFunctions(rest);
  }
  return deploySupabaseFunctions({
    ...rest,
    functionNames: Array.from(new Set(pendingFunctionDeploys)),
  });
}
