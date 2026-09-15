# AGENTS.md — Caide V1-backend / V2-UI convergence (branch `feature/v1-backend-v2-ui`)

## Mission (locked by user)

- **V2 UI, pixel-exact.** `apps/web/src` is the interface. No V1 visuals anywhere.
- **V1 backend, faithful.** Everything non-UI from V1 (`dyad x caide` at
  `/home/DejiTech/dev/personal projects/dyad x caide`) is ported: the agent, the turn
  flow, tools, prompts, providers, workers, services, DB, scaffolds, packaging.
  V1's agent flow is the gold standard — preserve it exactly, minus the bugs below.
- **Everything free.** No Pro, no gateway, no quota. Ported features work with user keys.
- **English only.** No i18n.
- **Fix in transit.** Port V1 bugs only as fixed versions (ledger in `plans/007`).

## Session rules

- Every session reads this file + `plans/007-master-v1-backend-transplant.md` first
  (re-read both after any context compaction), then the domain plan(s) in scope.
- Task completion: `bun fmt`, `bun lint`, `bun typecheck` must pass — run as ONE final
  bundled pass per task, not repeatedly during iteration.
- NEVER run `bun test`. Always `bun run test` (Vitest).
- Commit after EVERY major change (milestone per plan). Never commit secrets.
  Before committing: `git status`, `git diff`, `git log --oneline -5`; stage only intended files.
- Never add AI co-authorship to commit messages.
- Full-disk environment: packaging requires `CAIDE_DESKTOP_TMPDIR=/tmp/caide-stage`.
- `effect@4.0.0-beta.25` fork: `Effect.catchAll`/`catchAllCause` are absent at runtime —
  use `orElseSucceed`.

## Architecture law

- **Transport rule:** the V2 protocol stays (`/harness` WS events, orchestration RPC,
  `database.invoke`, `HarnessReveals`). V1 logic is implemented BEHIND it.
  Never rewire V2 UI to V1 IPC shapes; never reshape V2 UI to V1 visuals.
- **UI homes for ported capabilities:** right-dock panes (extend, rarely add),
  composer Context card (`EnvironmentPanel` sections), composer triggers
  (`@`/`$`/`/`), stacked composer panels/banners, dialogs. Catalog: `plans/017`.
- **Design system:** `apps/web/src/lib/disclosureMotion.ts` (`DisclosureRegion`,
  `DisclosureChevron`), `DockPaneHeader`, `PanelStateMessage`,
  `SettingsPanelPrimitives`, `Badge`/`StatusPill`. No bespoke toggle animations.
- **Settings reconciliation:** `plans/018` is authoritative for add/remove/replace.
- Donor repo `/home/DejiTech/dev/dyad` is reference-only (ambiguities, never behavior).

## Plan index (all active; old 001–006 deleted)

- `plans/007-master-v1-backend-transplant.md` — master (policy, phases, ledgers)
- `plans/008-agent-core.md` — turn engine, modes, consent, tool loop, cancel
- `plans/009-providers-models.md` — catalog, routing, keys, auth, custom/local
- `plans/010-persistence.md` — threads, versions, memory, compaction, goals engine
- `plans/011-preview-system.md` — proxy, tunnel, console, visual edit, device, release
- `plans/012-publish-deploy-share.md` — GitHub/Vercel, Neon sync, packages, collab
- `plans/013-mcp-integrations.md` — MCP registry/OAuth, Supabase, Neon, add-integration
- `plans/014-knowledge-chatpower.md` — skills, prompts, queue, tabs, cards, image, help
- `plans/015-shell-platform.md` — deep-links, dialogs, safeStorage, first-run, notify
- `plans/016-services-workers-scaffolds.md` — services, workers, scaffolds, tests
- `plans/017-ui-homes.md` — pane/context/composer catalog + plan→agent handoff spec
- `plans/018-settings-reconciliation.md` — settings add/remove/replace + sync map

## Repo roles

- `apps/web`: React/Vite UI — DO NOT restyle; extend only via 017 homes.
- `apps/server`: engine. V1 backend lands in `apps/server/src/dyad/**` (faithful ports)
  and `apps/server/src/harness/**` (transport/flow adaptation). Electron-main-only V1
  bits (safeStorage, tray, deep-links, utilityProcess, node-pty) land in `apps/desktop`.
- `packages/contracts`: schema-only, no runtime logic.
- `packages/shared`: runtime utils, explicit subpath exports, no barrel index.
