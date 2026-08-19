// FILE: stage-engine-payload.ts
// Purpose: Builds a self-contained Flutter engine payload for desktop packaging.
// Layer: Release/build helper
// Exports: stageEnginePayload, buildEngineDist, ENGINE_PAYLOAD_RELATIVE_DIR
//
// The engine is a standalone Node program (better-sqlite3, node-pty native
// bindings) spawned by the server via plain `node`. Node cannot read app.asar,
// so the engine must ship as an *unpacked* directory (an electron-builder
// extraResource landing at `<resourcesPath>/engine`). Its runtime deps must be
// co-located at `node_modules` — they cannot resolve from the packed/hoisted
// app tree — so this module produces a self-contained payload:
//
//   <payloadDir>/                       (packed → resources/engine)
//     apps/engine/dist/index.mjs        (engine bundle)
//     apps/engine/drizzle/              (SQL migrations)
//     node_modules/                     (engine prod deps, frozen install)
//
// The install mirrors the desktop stage's own frozen production install
// (`--ignore-scripts --linker hoisted`), resolving native modules for the
// target platform from the repository lockfile.

import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  RELEASE_LOCKFILE_PATH,
  RELEASE_PATCHES_PATH,
  RELEASE_WORKSPACE_MANIFEST_PATHS,
} from "./release-workspace-manifests";

/** Where the payload lives, relative to the staged desktop app dir. */
export const ENGINE_PAYLOAD_RELATIVE_DIR = "apps/engine-payload";

/**
 * Build the engine bundle (`apps/engine/dist/index.mjs`) via the engine's own
 * tsdown script unless it already exists.
 */
export function buildEngineDist(engineDir: string, verbose: boolean): boolean {
  const distEntry = join(engineDir, "dist", "index.mjs");
  if (existsSync(distEntry)) {
    return true;
  }
  const built = spawnSync("bun", ["run", "build"], {
    cwd: engineDir,
    stdio: verbose ? "inherit" : "ignore",
  });
  return built.status === 0 && existsSync(distEntry);
}

/**
 * Stage a self-contained engine payload inside the desktop stage.
 *
 * Steps (each fails the build rather than shipping a broken engine):
 *  1. Ensure the engine bundle exists (build it if missing).
 *  2. Copy the workspace manifests + lockfile + patches so the frozen install
 *     can resolve against the same graph as the repository.
 *  3. Write a payload package.json whose dependencies are the engine's resolved
 *     prod deps, then `bun install --frozen-lockfile --ignore-scripts --linker
 *     hoisted` (same flags as the desktop stage install) so native bindings
 *     land for the target.
 *  4. Copy `apps/engine/dist` + `apps/engine/drizzle` into the payload so the
 *     engine can boot + migrate from the unpacked location.
 *
 * @param repoRoot repository root.
 * @param stageAppDir staged desktop app directory (payload is created inside).
 * @param verbose stream install output when true.
 * @returns the payload directory (absolute) for an extraResource registration.
 */
export function stageEnginePayload(
  repoRoot: string,
  stageAppDir: string,
  verbose: boolean,
): { payloadDir: string } {
  const payloadDir = join(stageAppDir, ENGINE_PAYLOAD_RELATIVE_DIR);
  mkdirSync(payloadDir, { recursive: true });

  const engineDir = join(repoRoot, "apps/engine");
  if (!buildEngineDist(engineDir, verbose)) {
    throw new Error(`Engine bundle missing at ${join(engineDir, "dist", "index.mjs")}.`);
  }

  // Workspace manifests + lockfile + patches give `bun install` the exact same
  // dependency graph/resolution as the repository. The root package.json and
  // full workspace set must be present for `--frozen-lockfile` to resolve
  // against the repository lockfile without drift (a trimmed graph trips
  // "lockfile had changes"). The engine's own prod deps land hoisted in the
  // payload's node_modules; the extra workspaces cost disk but guarantee
  // byte-identical versions/native builds with the verified lockfile.
  for (const relativePath of RELEASE_WORKSPACE_MANIFEST_PATHS) {
    const destination = join(payloadDir, relativePath);
    mkdirSync(payloadDir, { recursive: true });
    mkdirSync(join(payloadDir, relativePath.split("/").slice(0, -1).join("/")), {
      recursive: true,
    });
    copyFileSync(join(repoRoot, relativePath), destination);
  }
  copyFileSync(join(repoRoot, RELEASE_LOCKFILE_PATH), join(payloadDir, RELEASE_LOCKFILE_PATH));
  cpSync(join(repoRoot, RELEASE_PATCHES_PATH), join(payloadDir, RELEASE_PATCHES_PATH), {
    recursive: true,
  });
  // pg-schema-classifier is a workspace member referenced by the engine; its
  // source copy must exist for lockfile resolution. The engine bundle already
  // inlines it (tsdown noExternal), so only the manifest is required here.
  mkdirSync(join(payloadDir, "packages", "pg-schema-classifier"), { recursive: true });
  copyFileSync(
    join(repoRoot, "packages", "pg-schema-classifier", "package.json"),
    join(payloadDir, "packages", "pg-schema-classifier", "package.json"),
  );

  const installResult = spawnSync(
    "bun",
    ["install", "--frozen-lockfile", "--ignore-scripts", "--linker", "hoisted"],
    { cwd: payloadDir, stdio: verbose ? "inherit" : "ignore" },
  );
  if (installResult.status !== 0) {
    throw new Error(
      `Engine payload dependency install failed (status ${installResult.status}). ` +
        `stderr: ${(installResult.stderr ?? "").toString().slice(-1500)}`,
    );
  }

  // Engine runtime: bundle + migrations.
  mkdirSync(join(payloadDir, "apps", "engine", "dist"), { recursive: true });
  copyFileSync(
    join(engineDir, "dist", "index.mjs"),
    join(payloadDir, "apps", "engine", "dist", "index.mjs"),
  );
  cpSync(join(engineDir, "drizzle"), join(payloadDir, "apps", "engine", "drizzle"), {
    recursive: true,
  });

  // Native bindings. `bun install --ignore-scripts` skips better-sqlite3's and
  // node-pty's install scripts (they download/compile platform binaries), so
  // install the bindings that the repository already compiled for this host.
  // The desktop stage applies the identical trick for node-pty; the engine also
  // needs better-sqlite3 (its SQLite), so both are copied here.
  copyRepoNativeBinding(
    repoRoot,
    payloadDir,
    "better-sqlite3",
    "better-sqlite3",
    "build/Release/better_sqlite3.node",
  );
  copyRepoNativeBinding(
    repoRoot,
    payloadDir,
    "node-pty",
    "node-pty",
    "build/Release/pty.node",
  );

  return { payloadDir };
}

/**
 * Copy a native binding compiled in the repository's bun cache into the payload
 * package dir, creating the package layout if the install did not produce it.
 * Both package names below resolve through the hoisted .bun cache (e.g.
 * `node_modules/.bun/better-sqlite3@12.11.1/node_modules/better-sqlite3/...`).
 * No-op when either side is missing (a host that never compiled it will fail
 * later at spawn, surfaced by the desktop's own native-build validation).
 */
function copyRepoNativeBinding(
  repoRoot: string,
  payloadDir: string,
  packageName: string,
  cacheKeyPrefix: string,
  relativeBinding: string,
): void {
  const cacheDir = join(repoRoot, "node_modules", ".bun");
  if (!existsSync(cacheDir)) {
    return;
  }
  const source = findCacheBinding(cacheDir, cacheKeyPrefix, packageName, relativeBinding);
  const stagedPackageDir = join(payloadDir, "node_modules", packageName);
  const stagedBinding = join(stagedPackageDir, relativeBinding);
  if (!source) {
    return;
  }
  if (existsSync(stagedBinding)) {
    return;
  }
  mkdirSync(join(stagedPackageDir, "build", "Release"), { recursive: true });
  copyFileSync(source, stagedBinding);
}

/**
 * Locate a compiled native binding inside the bun hoisted cache
 * (`node_modules/.bun/<name>@<version>/node_modules/<name>/<binding>`).
 * Versions change with the lockfile, so match on the package directory prefix
 * (`<cacheKeyPrefix>@`) rather than hardcoding.
 */
function findCacheBinding(
  cacheDir: string,
  cacheKeyPrefix: string,
  packageName: string,
  relativeBinding: string,
): string | null {
  const { readdirSync, statSync } = requireSyncFs();
  let entries: string[];
  try {
    entries = readdirSync(cacheDir, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return null;
  }
  const candidate = entries.find(
    (name) => name.startsWith(`${cacheKeyPrefix}@`) || name === cacheKeyPrefix,
  );
  if (!candidate) {
    return null;
  }
  const bindingPath = join(cacheDir, candidate, "node_modules", packageName, relativeBinding);
  if (!existsSync(bindingPath)) {
    return null;
  }
  return statSync(bindingPath).isFile() ? bindingPath : null;
}

function requireSyncFs(): {
  readdirSync: (dir: string, opts?: { withFileTypes?: boolean }) => Array<{ name: string }>;
  statSync: (p: string) => { isFile: () => boolean };
} {
  // Imported lazily so the helper fails soft if node:fs is unavailable (it
  // always is in Node, but avoids a hard import chain concern).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs") as unknown as {
    readdirSync: (dir: string, opts?: { withFileTypes?: boolean }) => Array<{ name: string }>;
    statSync: (p: string) => { isFile: () => boolean };
  };
}
