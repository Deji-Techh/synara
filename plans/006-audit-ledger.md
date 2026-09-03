# 006 Audit Ledger (living — update every milestone)

> Continuous-audit tracker. Every milestone must shrink the strip list and grow the landed list. Grep commands at bottom.

## A. Strip list — Caide-final old engine (status)

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
| Sidebar creation logic (`project.create` ~L2065, `thread.create` ~L2545/2575 in `Sidebar.tsx`) | `apps/web/src/components/Sidebar.tsx` | REWRITE Dyad two-level (M3): projects-only level 1, per-project chats level 2; keep framework selector in `CreateAppDialog.tsx` |
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
| `local_agent/tool_definitions.ts` + `tools/*.ts` + subagents | `dyad/tools/` (adapt to `defineTool` DSL) | LANDED catalog+permissions (M2, 7 tests green): 50-tool inventory w/ donor consent defaults, plan/build/readOnly/deferred/blueprint gating, SQL auto-approve, session consent round-trip. Pro/engine gates removed. File-edit batch LANDED in `dyad/editing/` (M2b, 7 tests green): cascading fuzzy matcher, block parser, marker escape, safe paths, search/multi/copy/delete/rename tools on defineTool DSL. Supabase deploy hooks + file locks deferred to M4. Git ×4 batch LANDED in `dyad/vcs/` (M2b, 4 tests green): porcelain status w/ rename handling, staged/path diff w/ truncation, log, commit w/ stage-all. Plan batch LANDED in `dyad/plan/` (M2b, 8 tests green): questionnaire/env-var human-gate waiter, todo merge/replace store, plan drafts under .caide/plans, exit precondition. Transport injected by WS layer in M3. MCP batch LANDED in `dyad/mcp/` (M2b, 6 tests green): keys, BM25 ranker, discovery tools, per-tool consent + round-trip, classifier prompt verbatim. Manager/transport/OAuth land in M4. Misc batch LANDED in `dyad/misc/` (M2b, 6 tests green): titles, compression w/ extractive fallback, reference guards, evidence JSONL, fs guide reader. DB panel control LANDED in `dyad/db/` (2 tests green): auto-open rule + `open_database_panel` agent tool (registered). WS reveal delivery in M3. Sandbox batch LANDED in `dyad/sandbox/` (M2b, 6 tests green): vm runner + read-only hosts, fork-skill registry + runner seam, task registries + status tools. |
| `chat_stream/` protocol + `chat_stream_handlers.ts` + `local_agent_handler.ts` | `dyad/stream/` adaptor to Caide WS | M2–M3 |
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
