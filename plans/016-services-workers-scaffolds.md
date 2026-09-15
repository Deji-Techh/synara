# 016 — Services, workers, scaffolds, test strategy

## 0. Goal

V1's backend services, worker plane, code intelligence, and scaffolds — ported,
measured, and tested. Dev-only harnesses stay out.

## 1. Services (port into `dyad/services/` or equivalent)

- `app_runtime_service` (dev-server spawn/kill/ports/proxy/cloud-sandbox) — merge
  with V2 `devServerManager`/`localServerMonitor` (keep the better half of each,
  tests decide).
- `git_service` (per-repo serialization + `index.lock` retry) wrapping V2 git utils.
- `isolated_test_db` (Neon temp branch + Supabase temp user + env rewrite).
- `collaboration_service` (realtime sessions against vendored share-service).
- `provider_api_key_validation_service` → hardens 009's probes (keep V2 secrets).
- `app_identity_service` (icons/logos) — small, port.
- Drop: `notch_service` (015 decision), `chalk` (was never a service).

## 2. Tunnel / preview services

- Tunnel CLIENT (011 owns the feature; implementation may live here):
  control WS + REST + secondary WS against the vendored relay.
- Upload preview providers (single + multi-tenant) + watcher resync + secret-path
  filter + installation identity. `preview-runtime`/`preview-worker` services:
  port or record 007 §7 with the technical reason (hosting dependency?).

## 3. Code intelligence (critical path for agent quality)

- Code-explorer worker (TS-AST index, LRU + forced-GC protocol) re-homed
  server-side (worker_threads or child process — NOT Electron utilityProcess;
  document the 4GB-cage equivalent safeguard).
- Agent tools: `code_search`, `explore_code` (+ raw variant + subagent reporters),
  `lsp_symbol_lookup` (token-light `path:line`-only design kept), BM25 + grep.
  Prompts may name-drop them ONLY after they exist (remove or gate current mentions).
- Typecheck worker (virtual-FS overlay, `tsconfig.app.json` preference,
  `.tsbuildinfo` cache) feeding Problems + `run_type_checks`.
- Success metric: V1's benchmark (78k→50k tokens with `explore_code`) reproduced
  on a fixture repo.

## 4. Sandbox execution

- Verify the ported `sandboxWorker`/`vmRunner`/`workerRunner` against V1's
  `sandbox_worker` protocol (budget start/pause/resume, host-call allowlist,
  settle-once, timeout). ` execute_sandbox_script` dynamic writability +
  capability gating per 008.

## 5. Scaffolds

- Verify V2 generators (blank/RN/flutter/website) emit working apps; diff against
  V1 `scaffold/` (shadcn app), `scaffold-web3` (ConnectWallet/chains), `scaffold-api`
  (Hono+Drizzle+Dockerfile) — tree-copy parity where V2 claims it.
- `scaffold-flutter` in V1 checkout is sparse (Gradle wrapper only) — regenerate
  from a real Flutter template or record the gap; do not ship a hollow scaffold.
- Keep V2's api-template `lib/events.ts` addition if tests cover it.

## 6. Migrations & scripts

- DB lineage: V1 drizzle 41 → TS-code migrations; `migrations:check` stays green;
  share-service SQL 001–006 untouched.
- Release/verify scripts: keep desktop-artifact + packaged-startup + migration
  lineage; add IPC/WS contract registration check (V1 `verify-ipc-registration`
  equivalent for the harness protocol), renderer bundle budget, release-assets gate.
- macOS cert tooling: port if signing needs it.

## 7. Test strategy (replaces 119-e2e port)

- Every ported module brings its V1 unit/integration tests (adapted to server
  imports; fake-LLM/ports seams re-created where they were test-only).
- New focused e2e: modes matrix, cancel-chain, consent, questionnaire, blueprint,
  plan→agent handoff, provider validation, versions, MCP OAuth (mock), deploy sync
  (mock). Depth over breadth — the 119-spec port is explicitly out.
- Evals/benchmarks/design-motion: out (007 §7).

## 8. Acceptance

- Token benchmark (§3) reproduced; typecheck worker feeds Problems e2e.
- All ported test files green under `bun run test`; contract/budget/asset gates pass.
- Scaffold matrix generates + builds (or 007 §7 records why).
