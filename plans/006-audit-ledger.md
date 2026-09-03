# 006 Audit Ledger (living — update every milestone)

> Continuous-audit tracker. Every milestone must shrink the strip list and grow the landed list. Grep commands at bottom.

## A. Strip list — Caide-final old engine (status)

### M0 verdict (audited, importer-verified)
- STRIPPED: server part-filler (116), stub dirs/tests, 13 codex* files (M0a); agentGateway contract + test (M0b).
- STAYS until migrations (all live-imported, deletion breaks boot/UI):
  - `harnessCompat` + orchestration/agentGateway/checkpointing/automation dirs → orchestration-read migration (turn/session stores replace projection queries).
  - `orchestration/automation/externalMcp/browserAutomation` contracts → same migration.
  - Web store/transport chain (`store`, reducer, projection, normalization, `wsTransport`, `wsNativeApi`, `workLog`) + routes/stores/panels → store migration + chat send-path rewire.
  - Desktop `browserAutomation/` (29) + `browserAnnotations/` (10) → imported by main/browserManager; preview replacement must land first.
  - Root junk → already absent.


M0b LANDED (contracts): agentGateway.ts + test deleted (zero users; 211 contracts tests green). orchestration/automation/externalMcp/browserAutomation contracts STAY — load-bearing for live persistence/RPC/UI until the orchestration-read migration. M0a LANDED (server filler): 116 part*.ts + stub testN/stub dirs + scaffold filler + 13 codex* files deleted (151 paths). harnessCompat/serverLayers/wsRpc stay — load-bearing for the live Effect server until the orchestration-read migration. One failing suite (`harness/prompts/prompts.test.ts` L0-L3) verified PRE-EXISTING on clean HEAD.

| Item | Location | Status |
|---|---|---|
| `codexAppServerManager.ts` + test | `apps/server/src/` | PENDING |
| `codexAppServerTransport.ts` + test | `apps/server/src/` | PENDING |
| `codexErrorClassification/GeneratedImages/HomePaths/ProcessEnv/TurnInput/WorkingDirectory.ts` | `apps/server/src/` | PENDING |
| `harnessCompat.ts` OrchestrationEngineService shim | `apps/server/src/` | PENDING |
| `threadRetention.ts` / `profileStatsArchive.ts` orchestration refs | `apps/server/src/` | PENDING |
| `harness/**/partN|testN|stub=true` filler (~100 files) | `apps/server/src/harness/` | PENDING |
| Old WS coupling (`wsSnapshotLiveStream`, `wsStreamAdmission/Backpressure`, `wsConnectionSessions`, `wsRequestAdmission`, `wsCompatibility`) | `apps/server/src/` | PENDING |
| Old web transport/store (`wsTransport`, `wsNativeApi`, `storeEventReducer/Projection/Normalization`, `store.ts`, `workLog.ts`) | `apps/web/src/` | PENDING |
| Out-of-scope web stores/routes (`goal/kanban/pin/automation`, `_chat.automations|kanban|plugins|pull-requests`) | `apps/web/src/` | PENDING |
| Old settings panels (`KeyboardShortcuts|AppIcon|Advanced|ConversationStorage|Desktop`, rebuild `ProvidersSettings`) | `apps/web/src/components/settings/` | PENDING |
| `ExternalMcpSettingsPanel` + `SkillsSettingsPanel` | `apps/web/src/components/settings/` | REBUILD in Caide styling (MCP servers/consents §5, project skills §6) — NOT deleted |
| MCP stack (`mcp_manager/shutdown/oauth/handlers/types/error_classifiers`, `search_mcp_tools`, `get_mcp_tool_schema`, `mcp_consent*`, `mcp_consent_policy`) + slash commands (`slash_commands.ts` pattern, Caide intent set + `/mcp`) | `dyad/mcp/` + composer | NEXT (M2 tools, M3 settings/chat) |
| Sidebar creation logic (`project.create` ~L2065, `thread.create` ~L2545/2575 in `Sidebar.tsx`) | `apps/web/src/components/Sidebar.tsx` | LANDED single-drill (M3c): expanding a project collapses the rest; mount normalizes multi-expanded trees to projects-only. Framework selector untouched. Creation-flow rewire (`createApp`/`chat:stream`) rides M3d loop integration. |
| Plan continue gate (approved plan → "Continue in Agent mode?" checkpoint) | planner + `CheckpointCard` | NEXT (M3) |
| Old contracts (`orchestration.ts`, `automation.ts`, `agentGateway*`, `checkpointing.ts`) | `packages/contracts/src/` | PENDING |
| Desktop `browserAutomation/` (28) + `browserAnnotations/` (11) | `apps/desktop/src/` | PENDING (verify Dyad preview replaces first) |

## B. Donor landed list — Dyad → `apps/server/src/dyad/`

| Donor file | Target | Status |
|---|---|---|
| `src/prompts/platform_contracts.ts` | `dyad/prompts/platformContracts.ts` | LANDED (M1) |
| `src/prompts/mobile_ui_skill_pack.ts` + `web_ui_skill_pack.ts` | `dyad/prompts/*SkillPack.ts` | LANDED (M1) |
| `src/prompts/design_engine_contract.ts` + `design_reference_index.ts` | `dyad/prompts/` | LANDED (M1) |
| `src/prompts/web3_skill_pack.ts` | `dyad/prompts/web3SkillPack.ts` | LANDED (M1) |
| `src/prompts/skills/**` + `skills-web3/**` (.md) | `dyad/skills/` (fs-loaded, no `?raw`) | LANDED (M1, 46 files) |
| `src/prompts/system_prompt.ts:510-659` + `local_agent_prompt.ts:460-527` wiring | `dyad/prompts/assembleDyadPrompt.ts` | LANDED as `systemPrompt.ts` + `agentPrompt.ts` + `planPrompt.ts` + `aiRules.ts` + `testGuidance.ts` + `frameworkType.ts` (M1, 6 tests green) |
| Agent preview control (`open/restart/status/stop_preview`, `build_apk` debug-only) wrapping `harness/preview/manager` | `harness/tools/previewTools.ts` (registered in default registry) | LANDED (M2, 4 tests green). `build_project` flutter step fixed to `--debug`. Framework briefs order the agent to drive preview itself. |
| `src/prompts/guides/**` + `filter_guide_by_framework.ts` | `dyad/guides/` | M2 |
| `src/prompts/plan_mode_prompt.ts`, `compaction/supabase/neon/security/summarize` | `dyad/prompts/` | M1–M2 |
| `src/ipc/shared/language_model_constants.ts` + `get_model_client.ts` + `llm_engine_provider.ts` + `secret_storage.ts` | `dyad/providers/` | LANDED catalog + registry + routing + key validation (M1, 6 tests green). FREE-ENTIRELY: gateway/`gatewayPrefix`/`DYAD_ENGINE_URL` dropped, `auto/free-pro` quota entry removed, `auto` resolves by local key presence, vertex(OAuth)/bedrock(SigV4)/chatgpt(OAuth, not ported) flagged `needs-work` with custom-provider workaround. M3 wires into harness apiAdapter. |
| `src/lib/schemas.ts` provider/model/AppTarget parts | `packages/contracts` ext + `dyad/` | M1 |
| `local_agent/tool_definitions.ts` + `tools/*.ts` + subagents | `dyad/tools/` (adapt to `defineTool` DSL) | LANDED catalog+permissions (M2, 7 tests green): 50-tool inventory w/ donor consent defaults, plan/build/readOnly/deferred/blueprint gating, SQL auto-approve, session consent round-trip. Pro/engine gates removed. File-edit batch LANDED in `dyad/editing/` (M2b, 7 tests green): cascading fuzzy matcher, block parser, marker escape, safe paths, search/multi/copy/delete/rename tools on defineTool DSL. Supabase deploy hooks + file locks deferred to M4. Git ×4 batch LANDED in `dyad/vcs/` (M2b, 4 tests green): porcelain status w/ rename handling, staged/path diff w/ truncation, log, commit w/ stage-all. Plan batch LANDED in `dyad/plan/` (M2b, 8 tests green): questionnaire/env-var human-gate waiter, todo merge/replace store, plan drafts under .caide/plans, exit precondition. Transport injected by WS layer in M3. MCP batch LANDED in `dyad/mcp/` (M2b, 6 tests green): keys, BM25 ranker, discovery tools, per-tool consent + round-trip, classifier prompt verbatim. Manager/transport/OAuth land in M4. Misc batch LANDED in `dyad/misc/` (M2b, 6 tests green): titles, compression w/ extractive fallback, reference guards, evidence JSONL, fs guide reader. DB panel control LANDED in `dyad/db/` (2 tests green): auto-open rule + `open_database_panel` agent tool (registered). WS reveal delivery in M3. Sandbox batch LANDED in `dyad/sandbox/` (M2b, 6 tests green): vm runner + read-only hosts, fork-skill registry + runner seam, task registries + status tools. | Web backends LANDED in `dyad/web/` (M2b, 4 tests green): fetch/extract, keyless DDG search + crawl, Pollinations images, local code search, symbol lookup, explorer digest. DB batch LANDED in `dyad/db/` (M4, 6 tests green): SQL safety + single-statement execute over bun:sql, schema inspection, session links, integration round-trip, nitro ordering. Goals LANDED in `dyad/goals/` (state + predicate + update/status tools, 2 tests green; scheduler/center in M3b). Subagent loop LANDED in `dyad/sandbox/subagentLoop.ts` (registry-settling async spawn, 3 tests green). M3a WS delivery LANDED (UI events, uiBridge, lean client, store queues). M3b visuals LANDED (prompt queue, plan card + continue gate, dock reveals). M3c single-drill sidebar LANDED. M3d real turn runner LANDED. M3e slash (ask/verify/fix/mcp) LANDED. M3f settings LANDED (MCP servers panel replacing outbound pairing, Database panel + live RPC tests, tool approvals, nav taxonomy). M3g persistence LANDED (session stores + settings_sync + JSONL snapshot/restore wired into CaideRunner; per-tool loop timeouts; client syncHarnessSettings on socket open). E17 desktop audit CLOSED (browserAutomation 29 + browserAnnotations 10 fully live: CDP runtime, screenshot capture, input actions, annotation webview security in main/browserManager/pipe server — powers verify/preview-inspect; zero safe deletions. E16a transcript feed LANDED (ordered store timeline + HarnessTranscript rendering markdown text, tool cards, checkpoints with approve actions, errors; mounted in HarnessSessionHost. Legacy orchestration timeline untouched. E15 read-model bridge LANDED (`harness/turn/eventLog.ts`: durable event log with token batching + tail replay on subscribe; runner persists + flushes; 4 tests green incl. socket-level replay. Full projection-query replacement stays phased. D scaffolds LANDED (flutter router+tabs+theme+lints upgrade; 4-framework scaffold tests; devicePresets port; web3+api template trees with copy functions; services/share-service + preview-control-plane as standalone deployables with migrations + tests + env examples. C10 sandbox+LSP LANDED (worker thread w/ main fallback, jailed write_file host, consent-gated MCP hosts via bridge channel, mtime symbol index serving lookupSymbol; 28 tests green across sandbox/web/tools/mcp suites. C9 keyed providers LANDED (Tavily > Brave > DDG, OpenAI Images > Pollinations, env-selected in turnContext; 4 tests green). C11 blockchain backend LANDED (`dyad/web3/networks.ts`: registry, donor-shape RPC tests, test_rpc tool in turns + catalog, settings_sync feed; 4 tests green. C8 provider management LANDED (`dyad/db/neonApi.ts` + `supabaseApi.ts` REST clients, migration-file writer on Supabase DDL, remote listing in info tools via session management tokens, integration card token field; 11 db tests green. SQL stays on linked DATABASE_URL. C7 MCP manager LANDED (`dyad/mcp/manager.ts`: dependency-free JSON-RPC stdio/SSE, lifecycle sync, registry feed, call transport, testServer; migration 094 tables + test; settings_sync servers → live tools. OAuth deferred to M4b. A2 goals LANDED (`dyad/goals/goalCenter.ts` + `goalScheduler.ts`: file-backed create/list/steer/pause/resume/cancel/edit/retry, dependency-ordered advancement, revision-pinned verification pass, verify_goal tool; 5 tests green. Daemon/tray omitted — agent-invoked passes. Goal center UI + /goal execution ride B3 RPC. A1 blueprint LANDED (`dyad/plan/blueprintTools.ts` + `blueprintStore.ts`: Caide-schema tool, framework resolution, session gate + assertAppBlueprintApproved enforced in TurnContext.executeWithConsent, blueprint_update event + blueprint_response approval → gateway steer; web HarnessBlueprintCard on the existing card. Catalog 60/60 native — zero missing. M3h gateway LANDED (`harness/turn/gateway.ts`: singleton runner + per-session inboxes + WS steer/cancel bindings; runner emits ui_reveal for DB/preview tool calls; inbox passthrough into runLoop). HTTP upgrade mount LANDED (`harnessGatewayMount.ts` on nodeServer, legacy-token rule, finalizer detach; turn_start inbound → gateway with bridge consent factories). B4 mount REPLACED by Effect route (raw-ws mount raced Effect's upgrade handler and crashed boot; hub split transport/dispatch, GET /harness route on the shared pipeline, gateway+bridge bind the hub. Live smoke: subscribed → provider_settings_state → turn_start → stage → structured TURN_FAILED (no keys in env) → turn_end. Chat-send-path invocation LANDED (B3): HarnessSessionHost per thread (socket + card stack + dock reveals), slash diversion for /ask|/verify|/fix|/mcp → gateway turn_start with fallback to text insert, plain-text sends stay orchestration until the store migration. |
| `chat_stream/` protocol + `chat_stream_handlers.ts` + `local_agent_handler.ts` | `dyad/stream/` adaptor to Caide WS | M3 wire #1 LANDED: `harness/turn/turnContext.ts` (provider auto/explicit, framework detect, unified 56-tool set, consent-gated execute, DB reveal routing; 3 tests green) |
| `src/db/schema.ts` drizzle + `supabase/neon/mcp/version` handlers | `dyad/db/` + handlers | M4 |
| `scaffold/` Caide layer, `scaffold-web3/`, `scaffold-api/` | `dyad/scaffolds/` | M2 |
| `services/share-service/` + `preview-control-plane/` + `project_package.ts` | `services/` + `dyad/share/` | M2 |
| `devicePresets.ts` + preview runtime | `dyad/preview/` behind `PreviewStage/DeviceScreen` | M5 |
| `blockchain_handlers.ts` + `blockchain.ts` + `blockchain_networks` table + `templates.ts` router | `dyad/web3/` | M2/M4 |

## C. UI mapping (styling stays Caide-final)

* Left `Sidebar.tsx`: keep rows/sections/`disclosureMotion`; replace `api.orchestration.dispatchCommand({type:"project.create"|"thread.create"})` with Dyad `api.app.createApp({templateId,name})` + `chat:stream` start. Keep `CreateAppDialog.tsx` framework grid untouched (immutable framework).
* Right dock (`DevicePanel`, `BrowserPanel`, `DiffPanel`, `PreviewStage 672px` + `DeviceScreen`): render Dyad preview URLs / console / version diffs. No Dyad CSS leak.
* Settings side: keep `ProfileSettingsPanel`, `ThemeModePicker`, `PaletteSwatchPicker`, `ModelsSettingsPanel` shell; rebuild provider/model stores on Dyad catalog; add Supabase/Neon/MCP/blockchain sections in Caide styling.
* Preview: Web → browser iframe; RN → `DeviceScreen androidPhone` + Expo URL; Flutter → `flutter run -d web-server` URL in same device frame; Blank → explicit empty state.

## D. DB / Supabase scope (M4)

* Drizzle `apps` (+`app_identity`, share provenance), `chats` (`chat_mode`), `messages` (`aiMessagesJsonV6`), `blockchain_networks`, `language_model_providers/models`, `mcp_servers/tool_consents`, FTS5 chat search.
* `supabase_handlers` + `supabase_prompt` + `SUPABASE_*_RULE` + `provision-backend.md` (`api/` + Neon provisioning) + `read_guide` tool; same for Neon.

## Audit greps (run per milestone)

```bash
grep -rn "orchestration/\|agentGateway\|codexAppServer\|harnessCompat\|export const stub" apps/server/src | wc -l
grep -rln "?raw\|@/" apps/server/src/dyad | head
ls apps/server/src/dyad/prompts apps/server/src/dyad/skills 2>/dev/null
grep -n "dispatchCommand" apps/web/src/components/Sidebar.tsx | head
```

## F. Verification status

Providers-from-donor LANDED (`dyad/providers/secrets.ts` 0600 file store, `testConnection.ts` live probes, gateway defaults, provider_settings_* WS messages + contract event, settings keys UI with Test buttons; chatgpt OAuth documented as not portable. F triage: full-suite 237 failures characterized — mass web failures are a missing babel-plugin-react-compiler env issue under the server runner; server failures audited file-by-file (zero imports of transplant code); fixed slash review providers, migration journals 092-094, compiler spread. Pre-existing failures evidenced at main + branch cut. Final full-suite gate (9150 tests, 2600 files): ZERO newly failing vs the pre-fix baseline; fixed composerSlashCommands + Migrations.test along the way. Remaining 55 failing files all evidenced pre-existing/environmental (babel-compiler env gap under server runner, branch-stale model-selection/compiler suites, one L0-L3 registry test failing on clean HEAD). Targeted gates all green: contracts 213, web affected 80, transplant+migrations 164. 