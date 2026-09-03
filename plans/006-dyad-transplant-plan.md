# 006 — Dyad x Caide Backend Transplant Plan (ACTIVE)

> **Supersedes `005-master-build-plan.md` for backend direction. `005` remains as harness reference only.**
> **Mission: Caide-final COMPLETE UI + Dyad / Dyad x Caide COMPLETE backend infra.**
> **Every session: re-read `AGENTS.md` then this file. One milestone = one commit.**

## 0. Direction (user directive 2026-09-03)

* Old Caide-final backend is thrash — strip EVERYTHING agent-related: system prompts, streaming, models/providers, tool calling, orchestration, gateway, checkpointing, automation, and anything missed in continuous audit.
* Donor backend: Dyad (primary, more perfect) + Dyad x Caide port deltas (Caide product layer).
* Keep: Caide-final complete UI shell + Caide-final design styling (no Dyad styling leak). Keep framework selector. Strip left-sidebar chat/project creation logic (replace with Dyad `createApp`/`chat` flow behind same UI).
* Port in scope:
  - Full agent engine: prompts, local-agent tool loop, streaming, providers/models, tools + approvals, IPC, DB (drizzle/sqlite), telemetry, context/RAG, compaction, plan/build modes, checkpoints/versions, preview/build pipeline.
  - Database system incl. Supabase + Neon (handlers, prompts, guides, `scaffold-api` provision flow).
  - Dyad x Caide Caide-layer: `platform_contracts`, mobile/web skill packs, design engine, web3 vertical, scaffolds, share + preview-control-plane services, device presets, AppTarget plumbing.
  - Preview: Dyad x Caide preview ported for Web + React Native, Flutter preview made to work — all inside Caide-final styling (672px `PreviewStage`, `DeviceScreen`, no fake bezels).
* UI mapping:
  - Left `Sidebar.tsx`: keep shell/rows/sections/motion, strip `project.create` / `thread.create` dispatch paths (lines ~1856, 2065, 2545, 2575), rewire to Dyad `ipc.app.createApp({templateId})` + `chat:stream`. KEEP `CreateAppDialog.tsx` framework selector (blank|react-native|flutter|website immutable). Sidebar goes Dyad two-level (`M3`): level 1 lists PROJECTS ONLY (favorites, collections, other apps + search, per donor `AppList.tsx`); selecting a project drills into its CHATS (Today/Yesterday/This week/Older groups, per donor `ChatList.tsx`, with back-to-projects, new-chat, rename/delete per chat). Chats never render expanded under every project at once. Caide styling + `disclosureMotion` throughout. Plan flow ends with a continue gate (`M3`): after plan approval / `exit_plan`, the UI asks "Continue in Agent mode?" — Approve starts the agent turn on the approved plan, Request change returns to the planner. Never silently auto-builds.
  - Right dock (`DevicePanel`, `BrowserPanel`, `DiffPanel`, `PreviewStage`): host Dyad preview/console/version outputs. Keep Caide styling. The agent drives preview itself via `open_preview` / `restart_preview` / `preview_status` / `stop_preview` + `build_apk` (debug signing only) — never gated behind a manual `/` command; `/preview` remains as manual override.
  - Settings (`ProfileSettingsPanel`, `ModelsSettingsPanel`, `ProvidersSettingsPanel`, `ThemeModePicker`, `PaletteSwatchPicker`): rebuild provider/model panels on Dyad `language_model_constants` + `providerSettings` + `secret_storage`; keep Profile + theme. Use settings side to surface Supabase/Neon/MCP/blockchain backends.
* Continuous audit rule: every milestone re-greps for leftover `orchestration/|agentGateway|codexAppServer|harnessCompat|stub=true|partN` + missing Dyad donor files. No milestone closes with thrash remaining in its scope.

## 1. Donor inventory (verified 2026-09-03)

Dyad `/home/DejiTech/dev/dyad`:
* `src/prompts/` (18 entries): `system_prompt.ts:745 constructSystemPrompt`, `local_agent_prompt.ts:602 buildLocalAgentSystemPrompt`, `plan_mode_prompt.ts:117`, `compaction_system_prompt.ts:5`, `summarize_chat`, `security_review`, `supabase_prompt`, `neon_prompt`, `test_assertions`, `mcp_consent_policy`, `guides/`, `skills` via tools.
* Engine: `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts:573 handleLocalAgentStream` + `tool_definitions.ts:139 TOOL_DEFINITIONS` (~48 tools in `tools/*.ts`) + `subagents/subagent_manager.ts`; legacy `src/ipc/handlers/chat_stream_handlers.ts:1-1395` + `processors/response_processor.ts:147`.
* Streaming: Vercel AI SDK `streamText`, `src/chat_stream/protocol.ts:7-15`, `high_volume_delivery.ts`, `stream_text_utils.ts:28 fastTextOutput`, `activeStreams:481`, `cancelTrackedStreams:657`, `MAX_TERMINATED_STREAM_RETRIES=3`.
* Models: `src/ipc/shared/language_model_constants.ts:35 MODEL_OPTIONS`, `src/ipc/utils/get_model_client.ts:85 getModelClient`, `llm_engine_provider.ts:145 createDyadEngine`, `schemas.ts:112-152 ProviderSettingSchema`, `settings.ts`, `secret_storage.ts`.
* IPC/DB: `src/ipc/ipc_host.ts:64` (60 domains), `src/preload.ts:34`, `contracts/core.ts`, `src/db/schema.ts:26-845` (drizzle sqlite), `supabase_handlers.ts`, `neon_handlers.ts`, `mcp_handlers.ts`, `version_handlers.ts`.
* Context/preview: `src/utils/codebase.ts:621 extractCodebase`, `processors/code_explorer.ts:403`, FTS5 chat search, `app_runtime_service.ts`, `preview_*`, `run_type_checks/run_tests/run_build`.

Dyad x Caide delta (`/home/DejiTech/dev/personal projects/dyad x caide`):
* P0 verbatim: `prompts/platform_contracts.ts:77 buildPlatformPrompt`, `mobile_ui_skill_pack.ts:81`, `web_ui_skill_pack.ts:9`, `design_engine_contract.ts`, `web3_skill_pack.ts:47`, `system_prompt.ts:510-659` + `local_agent_prompt.ts:460-527` placeholder wiring, `schemas.ts:304-372 AppTarget`, `AppTargetSelector.tsx`, `scaffold/.caide/*` + `src/caide-ui/*` + `src/lib/api.ts`, whole `scaffold-web3/`, whole `scaffold-api/` + `guides/provision-backend.md`, `blockchain_handlers.ts:1-189`, `blockchain.ts:1-73`, `blockchain_networks:418-435`, `templates.ts:34-90`, `services/share-service/` + `preview-control-plane/`, `devicePresets.ts:1-316`.
* Do NOT carry: `caide/out/` (empty), `scaffold-flutter/` (hollow — rebuild), branding renames, stale `PRODUCT.md/plans/multi-platform-web-and-mobile.md`.

## 2. Caide-final strip list (M0)

Server `apps/server/src/`: `codexAppServerManager.ts`, `codexAppServerTransport.ts`, `codex*.ts`, `harnessCompat.ts` OrchestrationEngineService shim, `threadRetention.ts` orchestration refs, `profileStatsArchive.ts` gateway refs, all `harness/**/partN|testN|stub=true` filler, old `ws*` coupling files per 005 M0.1. Keep: `harness/turn,loop,session/storage+buildChain,router,inbox,provider/apiAdapter+stream+models,prompts/assembler+layers,tools/defineTool+registry,framework/registry,builder,verifier,ws/server,design/tokens.ts` as adaptor shells only until Dyad code lands.
Web `apps/web/src/`: strip `wsTransport.ts`, `wsNativeApi.ts`, `storeEventReducer/Projection/Normalization`, `store.ts`, `workLog.ts`, old composer-draft stores, goal/kanban/pin/automation stores, `routes/_chat.automations*|kanban*|plugins|pull-requests*`, `harness-stub/`, settings `ExternalMcp|Skills|KeyboardShortcuts|AppIcon|Advanced|ConversationStorage|Desktop` panels (rebuild Supabase/Neon/MCP/blockchain settings in their place using Caide styling). KEEP all visual components, `disclosureMotion.ts`, `PreviewStage 672px`, `DeviceFrame`, composer UI, `FrameworkIcon`, `CaideLogo`, `CreateAppDialog` framework grid.
Contracts `packages/contracts/src/`: delete `orchestration.ts`, `automation.ts`, `agentGateway*`, `checkpointing.ts`. Keep `harnessEvents/sessionContracts/projectContracts/baseSchemas/projectFramework` — extend with Dyad `ChatMode`, `ProviderSetting`, `ModelSelection`, `blockchain` contracts.
Desktop: keep window shell (`main.ts`, `preload.ts`, `windowState`, `ipcChannels`, `desktopWsBridge`, backend supervision, updater). Delete `browserAutomation/`, `browserAnnotations/` only if Dyad preview replaces them (verify first).

## 3. Transplant phases (M1–M5 + follow-ons)

* M1 — Dyad core engine land: `prompts/` → `apps/server/src/dyad/prompts/` (vanilla first), `local_agent/` tool loop + `tool_definitions` + `tools/` + subagents, `chat_stream/` protocol + handlers adapted to Caide WS envelope, `get_model_client` + `language_model_constants` + settings/secret_storage, `ipc_host` registrar pattern, `db/schema` drizzle migration, supabase/neon/mcp/version handlers. Gate: `bun run test` for ported tools/prompts; no `stub=true` remains in touched dirs.
* M2 — Caide product overlay: platform contracts + skill packs + design engine + AppTarget plumbing + web3 vertical + scaffolds (`scaffold/` Caide layer, `scaffold-web3/`, `scaffold-api/` + guide filter + `read_guide`) + share/preview-control-plane + device presets. Rebuild `scaffold-flutter/` natively (Expo-equivalent Flutter template with `.caide/*.json`). Gate: prompt assembly tests for mobile|web × plan|build|local-agent; scaffold tests per framework.
* M3 — UI rewire (keep styling): left sidebar creation → Dyad `createApp`/`chat:stream`; right dock → Dyad preview/console/versions; settings side → Dyad providers/models + Supabase/Neon/MCP/blockchain; `PreviewStage` + `DevicePanel` → Dyad preview runtime for web/RN/flutter. Gate: manual create→chat→stream→preview per framework; no orchestration imports remain in `Sidebar/CreateAppDialog/PreviewStage/DevicePanel`.
* M4 — DB + Supabase/Neon end-to-end: drizzle migration incl. `blockchain_networks`, `app_identity`, share provenance cols; Supabase/Neon connect → prompt injection → `execute_sql` gating → `scaffold-api` provision guide. Gate: connect test handlers + `execute_sql` approval specs pass.
* M5 — Preview + build per framework: `fingerprintFiles`, `watchProjectTree 450ms`, `buildRunner` (RN `expo start`, flutter `flutter run -d web-server`, website `vite dev`, blank explicit none) behind Caide `PreviewStage/DeviceScreen` styling. Gate: fingerprint/debounce tests + manual preview per framework <2s update, structured build errors.
* Follow-ons (from 005, rescoped): human gates (`CheckpointCard`), taste/anti-slop, edge/adversarial/coherence/security/perf, motion role, benchmark, self-improve, acceptance M27.

## 5. MCP system (user directive 2026-09-03)

Dyad's MCP stack is ported whole and surfaced in Settings + chat — no Pro gate:

* Server layer (`M4`): `mcp_manager.ts` (lifecycle) + `mcp_shutdown.ts` + `mcp_oauth_flow/provider.ts` + `mcp_handlers.ts` + `ipc/types/mcp.ts` + `mcp_error_classifiers.ts` → `dyad/mcp/`. Secrets via existing secret storage (encrypt at rest like donor `encryptStoredMcpSecrets`).
* Agent tools (`M2`): `search_mcp_tools` + `get_mcp_tool_schema` (+`mcp_type_defs`, BM25) adapted to `defineTool`; MCP tools callable in normal chat through search-then-call.
* Consent (`M2`): `mcp_consent.ts` + `mcp_auto_consent.ts` + `mcp_consent_context.ts` + `mcp_consent_policy.ts` (classifier prompt, cheap model) → donor policy verbatim (allow read-only/sandbox/in-scope-reversible/authorized/inbound-fetch/recoverable-delete; always ask exfiltration/comms/shared-state/access-control/sensitive-read/out-of-scope/blast-radius/real-world/deferred/unknown). Free-entirely: no Pro-gated auto-approve; user toggles rule.
* Settings UI (`M3`, Caide styling — `ExternalMcpSettingsPanel` is REBUILT, not deleted): server list (add/remove/enable), OAuth connect, per-tool consent (ask/always/never), `autoApproveSafeMcpTools` toggle, connection status. Usable two ways:
  1. Normal chat — agent searches + calls MCP tools with consent cards.
  2. `/` commands — composer slash menu lists MCP servers/tools (`/mcp <server> <tool>` style) alongside mode commands (`/plan`, `/ask`, `/build`, `/verify`, `/fix`); donor `BUILTIN_SLASH_COMMANDS` goal-set is NOT carried (goal system out of scope), Caide intent commands + MCP commands are.
* Card: MCP calls render in the themed tool-card set (server chip + tool chip + auto-approved chip + Input/Result panes, per `DyadMcpToolCall` pattern).

## 6. Other-systems sweep (settings vs right dock)

Everything below is ported; nothing important stays behind. Placement rule: credentials/config → settings side; live run state → right dock.

Settings side (Caide styling, `M3–M4`):
1. Providers/models (Dyad catalog — `M1` landed, UI in `M3`).
2. MCP servers + tool consents (§5).
3. Supabase + Neon connections (`M4`, incl. `provision-backend.md` flow).
4. Blockchain networks (web3 RPC manager — `blockchain_handlers` + `blockchain_networks` table, `M4`).
5. Agent tool approvals (per-tool ask/always/never + safe-SQL/MCP auto-approve switches).
6. Project skills (`appSkillPack` — `SkillsSettingsPanel` REBUILT as project-skill assignment, not deleted).
7. Chat mode defaults + framework selector (kept).

Right dock (`M3`, `M5`):
1. Preview console + device/browser preview (`PreviewStage`/`DevicePanel`/`BrowserPanel`).
2. Problems/diagnostics (tsc output).
3. Versions timeline (commit restore via `version_handlers`).
4. Tests panel (Playwright specs run).
5. Background tasks + subagents (spawn/wait/cancel + `BackgroundTasksDialog` pattern).
6. Review workbench (reviewer-subagent findings).
7. Context/compaction status (budget banner).

Database auto-open rule (`M3` WS): any DB `tool_call` event (`execute_sql`, Supabase/Neon info, schema, `add_integration`, `enable_nitro`) or DBFoo talk (database/Supabase/Neon/SQL/provision) auto-reveals the right-dock `database` pane; the agent also drives it directly via `open_database_panel`. Full autonomous control — never manual.

## 4. Verification + audit discipline

* Per milestone: `grep -rn "orchestration/|agentGateway|codexAppServer|harnessCompat|export const stub" apps/server/src` must shrink (M0→M1) then hit zero in touched scope; donor-file checklist diffed against `src/prompts/`, `local_agent/tools/`, `ipc/handlers/`, `db/schema.ts`.
* No `bun fmt/lint/typecheck` unless user asks (per AGENTS.md). `bun run test` only for affected files when needed.
* One milestone = one commit on `feature/dyad-transplant-v1`. Never leave tree dirty.

_Last updated: 2026-09-03. Active branch: `feature/dyad-transplant-v1`. Next: M0 strip + audit._
