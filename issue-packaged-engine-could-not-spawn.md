# Issue: packaged desktop app could not spawn the Flutter engine

**Status:** Resolved (commits `979fb21d`, `6d60f331`, `c2770f7d`, `721cf88b`)
**Area:** Desktop packaging + engine spawn (`apps/server`, `apps/desktop`, `apps/engine`, `scripts/build-desktop-artifact.ts`)
**Symptom:** The built AppImage booted the UI, but the Flutter engine — the heart of the product ("create an app, build it, preview it") — never started. The backend could not find or run it, so goal execution / analyze / test / build / preview were all dead.

---

## What stalled us

We thought the remaining step for Milestone M5 was just "build the AppImage". It was not. Building it surfaced that **the engine was never actually packagable**, and untangling that was a multi-day chain of latent defects:

1. **The engine could not even boot in a self-contained layout.**
   - `apps/engine` imported `electron-log/main`, whose `main.js` requires Electron's `app`. A headless engine spawned as plain `node` has no Electron, so the process threw before serving anything.
   - The engine bundle (`dist/index.mjs`) imported `pg-schema-classifier` — a private workspace package whose `package.json` points `main` at `./src/index.ts`. In the monorepo that resolves via the workspace symlink; in an unpacked product directory it either failed or resolved a TypeScript source file at runtime. The engine's tsdown config only inlined `@caide/*`, not this package.

2. **The server resolve the engine to the wrong absolute path.**
   `EngineAdapter.resolveEngineCommand()` computed the engine dir with `new URL("../../../../engine", import.meta.url)`. That math is correct for the TS source tree under vitest (`apps/server/src/provider/Layers` → `apps/engine`) but **wrong for the bundled server** (`apps/server/dist/index.mjs` → 4 levels up lands outside the repo, at `~/engine`). So even the repo's own `node dist/index.mjs` server could not find the engine — only tests worked, masking the bug.

3. **Engine stdio errors were silent.**
   The engine's JSON-RPC loop attached `handleRequest().then(send)` with no rejection handler. If `initialize` threw (e.g. missing migrations), the rejection vanished — the supervisor saw only silence and a timeout, with no error to diagnose. We only found the true cause ("Migrations folder not found") after adding a rejection handler.

4. **SQL migrations are resolved by walking up from the bundle.**
   `initializeDatabase()` searched upward from the engine for a `drizzle/` folder next to the bundle. That works in the repo; in an unpacked product dir there is no sibling `drizzle/`, so the DB never initialized.

5. **electron-builder strips `node_modules` out of `extraResources`.**
   The engine is a standalone Node program (better-sqlite3, node-pty native bindings) spawned by the server via plain `node` — which **cannot read `app.asar`**. It must ship as an _unpacked_ directory at `resources/engine` with its prod deps **co-located** at `resources/engine/node_modules` (Node walks up, it will never see the packed hoisted tree). Getting electron-builder to actually keep `node_modules` there was a whole hunt:
   - extraResources alone unpacked dist/drizzle/manifests but **pruned node_modules**.
   - Staging the payload _inside_ the app dir made electron-builder pack it into `app.asar` (swallowing node_modules there too).
   - Injecting _after_ electron-builder ran was too late — the AppImage was already compressed.
   - The payload initially installed the **entire monorepo** (1418 packages, ~1.4 GB) because a fresh install of the whole workspace was the only way `bun install --frozen-lockfile` matched the repository lockfile → also caused `ENOSPC` on a full disk mid-assembly.

---

## How I fixed it

### 1. Make the engine bootable headless (`979fb21d`)

- Bundled `pg-schema-classifier` into `apps/engine/dist` via tsdown (`noExternal: (id) => id.startsWith("@caide/") || id === "pg-schema-classifier"`), so no `.ts` resolves at runtime and no workspace symlink is required.
- Switched the engine's `electron-log/main` imports to `electron-log/node` (the headless entry that does not require Electron).

### 2. Fix engine resolution in the bundled server (`979fb21d`)

- `resolveEngineCommand()` now checks, in order: `CAIDE_ENGINE_DIR` env (packaged desktop), the bundled-server repo layout (`../../../apps/engine` from `apps/server/dist`), and the source/vitest layout (`../../../../engine`). Falls back to a one-time `bun run build` in the engine when no bundle exists.

### 3. Surface engine stdio failures (`6d60f331`)

- The stdio loop now catches request rejections and writes a JSON-RPC error back instead of dropping them — so the supervisor sees the cause instead of a timeout.
- `initializeDatabase()` resolves the migrations folder via `CAIDE_ENGINE_DRIZZLE_DIR` first (with a fallback to the upward walk) and validates the folder actually contains `drizzle/meta`.

### 4. One source of truth for the packaged layout (`979fb21d`, `6d60f331`)

- Added `CAIDE_ENGINE_DIR_ENV` and `CAIDE_ENGINE_DRIZZLE_DIR_ENV` to `@caide/shared/desktopIdentity` — packaging, the desktop main, and the server adapter all derive the same constants.
- The desktop main injects `CAIDE_ENGINE_DIR = <resourcesPath>/engine` and `CAIDE_ENGINE_DRIZZLE_DIR = <resourcesPath>/engine/drizzle` when packaged, and the server reads them.

### 5. Ship the engine as a lean, unpacked, self-contained payload (`c2770f7d`, `721cf88b`)

- **`scripts/lib/stage-engine-payload.ts`** builds a payload _outside_ the app dir (`stageRoot/engine-payload`):
  - installs **only the engine's real prod deps** (resolved from the workspace catalog, no workspace members — those are bundled), `--omit=dev --ignore-scripts --linker hoisted`, ~250 MB instead of the 1.4 GB full-workspace install;
  - copies `apps/engine/dist` + `apps/engine/drizzle`;
  - copies the repo-compiled native bindings (`better-sqlite3.node`, `pty.node`) into the payload — the same trick the desktop stage already uses for `node-pty`.
- **`scripts/build-desktop-artifact.ts`** registers the payload as an `extraResources` entry (`from: <absolute payload dir>, to: "engine"`) so it lands unpacked at `resources/engine`, and — because electron-builder prunes `node_modules` from extraResources after the fact — wires an **afterPack hook**:
  - **`scripts/lib/engine-afterpack-hook.cjs`** (copied into the stage, referenced as `afterPack` in the electron-builder config, payload passed via `CAIDE_ENGINE_PAYLOAD_DIR`) re-injects the payload's `node_modules` into `resources/engine` _after_ unpacking and _before_ the AppImage is assembled. That fixed the ordering/timing trap.

---

## Verification (the issue is closed only because this passed)

- Engine boots headless from a minimal staged payload (engine `initialize` returns
  `capabilities: { flutter: true, preview: true }`, DB migrates, `goal:create`
  routes to a handler).
- Full `dist:desktop:linux` build succeeds without `ENOSPC`.
- Extracted `release/Caide-0.0.1-x86_64.AppImage` → `resources/engine` is 250 MB,
  262 packages, `better_sqlite3.node` + `pty.node` present, 42 migrations, engine `dist` boots and serves JSON-RPC.

### Key files

- `apps/server/src/provider/Layers/EngineAdapter.ts` — engine resolver (env → repo layouts)
- `apps/desktop/src/main.ts` — injects `CAIDE_ENGINE_DIR` / `CAIDE_ENGINE_DRIZZLE_DIR` when packaged
- `apps/engine/src/index.ts` — surfaced stdio rejections
- `apps/engine/src/db/index.ts` — `CAIDE_ENGINE_DRIZZLE_DIR` migrations resolution
- `apps/engine/tsdown.config.ts` — bundle pg-schema-classifier
- `scripts/lib/stage-engine-payload.ts` — lean self-contained engine payload
- `scripts/lib/engine-afterpack-hook.cjs` — re-injects node_modules before AppImage assembly
- `scripts/build-desktop-artifact.ts` — extraResources + afterPack wiring
- `packages/shared/src/desktopIdentity.ts` — `CAIDE_ENGINE_DIR_ENV`, `CAIDE_ENGINE_DRIZZLE_DIR_ENV`
