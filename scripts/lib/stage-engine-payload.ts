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
//     node_modules/                     (engine prod deps only)
//
// The payload installs ONLY the engine's real dependencies (its workspace
// members like pg-schema-classifier are bundled into the engine dist, so no
// workspace manifests are needed). The install is intentionally NOT frozen:
// it is a disposable staging payload, and resolving engine deps alone (rather
// than the whole monorepo) keeps it ~250 MB instead of ~1.4 GB. Versions are
// resolved from the repository workspace catalog so they match the lockfile.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync as readSyncDir,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import rootPackageJson from "../../package.json" with { type: "json" };
import enginePackageJson from "../../apps/engine/package.json" with { type: "json" };

/** Where the payload lives, relative to the staged desktop app dir. */
// Stage the payload as a sibling of the app dir (NOT inside it): electron-
// builder packs everything under the app dir into app.asar by default, which
// would swallow the engine's node_modules instead of shipping them as an
// unpacked extraResource.
export const ENGINE_PAYLOAD_RELATIVE_DIR = "engine-payload";

/**
 * Resolve the engine's production dependencies to concrete version specs:
 * `catalog:` specifiers are replaced with the concrete workspace catalog value
 * and `workspace:*` members are dropped (they are bundled into the dist via the
 * engine's tsdown `noExternal` config).
 */
export function resolveEnginePayloadDependencies(): Record<string, string> {
  const catalog =
    (rootPackageJson.workspaces as { catalog?: Record<string, unknown> }).catalog ?? {};
  const deps = enginePackageJson.dependencies as Record<string, unknown> | undefined;
  if (!deps) {
    throw new Error("Could not resolve dependencies from apps/engine/package.json.");
  }
  const resolved: Record<string, string> = {};
  for (const [name, specRaw] of Object.entries(deps)) {
    const spec = String(specRaw);
    if (spec.startsWith("workspace:")) {
      continue;
    }
    if (!spec.startsWith("catalog:")) {
      resolved[name] = spec;
      continue;
    }
    const key = spec.slice("catalog:".length).trim() || name;
    const concrete = catalog[key];
    if (typeof concrete !== "string" || concrete.length === 0) {
      throw new Error(`Unable to resolve '${spec}' for engine dependency '${name}'.`);
    }
    resolved[name] = concrete;
  }
  return resolved;
}

/**
 * Build the engine bundle (`apps/engine/dist/index.mjs`) via the engine's own
 * tsdown script unless it already exists.
 */
export function buildEngineDist(engineDir: string, verbose: boolean): boolean {
  // Always rebuild. A previous existsSync() fast-path shipped stale bundles
  // inside release artifacts whenever an old dist/index.mjs was lying around
  // — every source fix stayed invisible in packaged builds. tsdown bundling
  // is cheap relative to shipping a binary that ignores the source tree.
  const built = spawnSync("bun", ["run", "build"], {
    cwd: engineDir,
    stdio: verbose ? "inherit" : "ignore",
  });
  const distEntry = join(engineDir, "dist", "index.mjs");
  return built.status === 0 && existsSync(distEntry);
}

/**
 * Stage a self-contained engine payload inside the desktop stage.
 *
 * Steps (each fails the build rather than shipping a broken engine):
 *  1. Ensure the engine bundle exists (build it if missing).
 *  2. Write a payload package.json with the engine's resolved prod deps and
 *     `bun install --omit=dev --ignore-scripts --linker hoisted`. Native
 *     bindings (better-sqlite3, node-pty) are compiled in the repo for this
 *     host and copied in (the desktop stage applies the identical trick for
 *     node-pty; --ignore-scripts skips their download/compile scripts).
 *  3. Copy `apps/engine/dist` + `apps/engine/drizzle` so the engine can boot +
 *     migrate from the unpacked location.
 *
 * @param repoRoot repository root.
 * @param payloadParentDir directory the payload is created inside (outside the
 *   packaged app dir so electron-builder ships it as an unpacked extraResource
 *   rather than packing it into app.asar).
 * @param verbose stream install output when true.
 * @returns the payload directory (absolute) for an extraResource registration.
 */
export function stageEnginePayload(
  repoRoot: string,
  payloadParentDir: string,
  verbose: boolean,
): { payloadDir: string } {
  const payloadDir = join(payloadParentDir, ENGINE_PAYLOAD_RELATIVE_DIR);
  mkdirSync(payloadDir, { recursive: true });

  const engineDir = join(repoRoot, "apps/engine");
  if (!buildEngineDist(engineDir, verbose)) {
    throw new Error(`Engine bundle missing at ${join(engineDir, "dist", "index.mjs")}.`);
  }

  const payloadPackageJson = {
    name: "caide-engine-payload",
    private: true,
    version: enginePackageJson.version,
    type: "module",
    dependencies: resolveEnginePayloadDependencies(),
  };
  writeFileSync(
    join(payloadDir, "package.json"),
    `${JSON.stringify(payloadPackageJson, null, 2)}\n`,
  );

  const installResult = spawnSync(
    "bun",
    ["install", "--omit=dev", "--ignore-scripts", "--linker", "hoisted"],
    { cwd: payloadDir, stdio: verbose ? "inherit" : "ignore" },
  );
  if (installResult.status !== 0) {
    throw new Error(
      `Engine payload dependency install failed (status ${installResult.status}). ` +
        `stderr: ${(installResult.stderr ?? "").toString().slice(-1500)}`,
    );
  }

  // Engine runtime: bundle + migrations, placed FLAT at the payload root so
  // the electron-builder extraResource (`to: "engine"`) lands them exactly
  // where the server resolver + desktop CAIDE_ENGINE_DIR injection expect:
  //   resources/engine/dist/index.mjs
  //   resources/engine/drizzle/
  mkdirSync(join(payloadDir, "dist"), { recursive: true });
  copyFileSync(join(engineDir, "dist", "index.mjs"), join(payloadDir, "dist", "index.mjs"));
  cpSync(join(engineDir, "drizzle"), join(payloadDir, "drizzle"), {
    recursive: true,
  });

  // Native bindings. `bun install --ignore-scripts` skips better-sqlite3's and
  // node-pty's install scripts (they download/compile platform binaries), so
  // install the bindings that the repository already compiled for this host.
  copyRepoNativeBinding(
    repoRoot,
    payloadDir,
    "better-sqlite3",
    "better-sqlite3",
    "build/Release/better_sqlite3.node",
  );
  copyRepoNativeBinding(repoRoot, payloadDir, "node-pty", "node-pty", "build/Release/pty.node");

  copyDugiteEmbeddedGit(repoRoot, payloadDir);

  return { payloadDir };
}

/**
 * Dugite's npm package fetches its embedded Git distribution via a postinstall
 * script, which the payload install deliberately skips (`--ignore-scripts`
 * keeps native compile/download scripts out of staging). Without it,
 * resolveGitBinary points at a nonexistent `<payload>/node_modules/dugite/git`
 * and every engine git call fails with dugite's packaging ENOENT. Copy the
 * repository's already-downloaded distribution into the staged package instead.
 *
 * Fails the build only when dugite IS a runtime dep but cannot be populated:
 * silently shipping a broken engine is what caused the stale-bundle incident.
 */
function copyDugiteEmbeddedGit(repoRoot: string, payloadDir: string): void {
  const stagedPackageDir = join(payloadDir, "node_modules", "dugite");
  if (!existsSync(join(stagedPackageDir, "package.json"))) {
    // Not an engine dependency anymore — nothing to do.
    return;
  }
  const cacheDir = join(repoRoot, "node_modules", ".bun");
  let entries: string[] = [];
  try {
    entries = readSyncDir(cacheDir).map((e) => String(e));
  } catch {
    entries = [];
  }
  const candidate = entries.find((name) => name.startsWith("dugite@"));
  const source = candidate
    ? join(cacheDir, candidate, "node_modules", "dugite", "git")
    : null;
  if (!source || !existsSync(join(source, "bin"))) {
    throw new Error(
      "Could not find dugite's downloaded Git distribution in this repository " +
        "(node_modules/.bun/dugite@*/node_modules/dugite/git). Run `bun install` " +
        "at the repository root so dugite's postinstall runs before staging the " +
        "engine payload.",
    );
  }
  cpSync(source, join(stagedPackageDir, "git"), { recursive: true });
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
  let entries: string[];
  try {
    entries = readSyncDir(cacheDir).map((e) => String(e));
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
