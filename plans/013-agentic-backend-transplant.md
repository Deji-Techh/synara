# Plan 013 — Full Backend Transplant: dyad×caide harness into Caide's engine

Status: IN PROGRESS
Branch: `feature/backend-transplant`
Source: `backup/dyad-engine-transplant` (P8) — read-only reference; do NOT merge it.
Product: Caide Flutter Builder — Caide UI kept as-is; dyad×caide backend replaces ALL agentic machinery.

## Decisions (user-confirmed)

| #   | Decision     | Choice                                                                                                                                                                                   |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backend host | `apps/engine` child process (JSON-RPC stdio) runs the ENTIRE dyad backend; `apps/server` = thin supervisor                                                                               |
| 2   | Source       | `backup/dyad-engine-transplant` (already has dyad backend + Flutter layer + free-tier removal); its UI is DISCARDED                                                                      |
| 3   | Scope        | Flutter-only: strip supabase/neon integrations, web3 skills, collab/tunnels/public previews, notch, updater, deep links, capacitor (web-target) machinery, turbo-edits-v2 web build path |
| 4   | Projects     | dyad `create-app` model: projects are CREATED apps in fixed `~/caide-apps`, no folder picking                                                                                            |
| 5   | Sidebar      | Flatten to Projects + per-project chats only: drop SpaceSwitcher/Pinned/Studio/Home-chats sections                                                                                       |
| 6   | Legacy       | Existing folder-opened projects stay listed/usable as-is (non-destructive)                                                                                                               |
| 7   | Activity     | New per-project Activity view (main pane, redesigned) replaces sidebar task-feed                                                                                                         |

## STRIP from Caide

- 27 provider adapters in `apps/server/src/provider/{Layers,Services}/`
- `apps/server/src/codexAppServerManager.ts` + codex transport/process env plumbing
- `apps/engine/src/agent/agentLoop.ts` + thin tools (file/flutter/blueprint) + thin `turn/run` protocol
- `apps/web/src/components/goals/stubs.ts` (goals UI becomes real)
- Current slash-command impls; current provider settings bindings (rebound to dyad schema)

## KEEP

- wsRpc/Effect server, auth, event store (SQLite), settings panels + secret store (server keeps keys; engine gets decrypted config via initialize handshake — existing pattern), preview WS handlers, desktop shell, web UI components (data sources/wiring only change; ChatView/MessagesTimeline/Composer/approval panels/mode selector untouched visually)

## Architecture

### apps/engine = full dyad backend (imported from backup branch, adapted at transport seams only)

- Agent core: `local_agent_handler.ts` + `chat_stream_handlers.ts` dispatch (ask/plan/local-agent modes), `tool_definitions.ts` (40+ tools), `tools/` (87 files), `prepare_step_utils.ts`, `retry_replay_utils.ts`, `todo_persistence.ts`, `ai_messages_cleanup.ts`, `xml_tool_translator.ts`
- Model clients: `get_model_client.ts` (openai/anthropic/google/xai/deepseek/openrouter/ollama/lmstudio/custom baseURL — API-key only, ZERO CLIs), `fallback_ai_model.ts`, `ollama_provider.ts`, `lm_studio_utils.ts`, `token_utils.ts`, `provider_options.ts`, `cache_breakpoints.ts`
- Goals: `goal_store.ts`, `goal_scheduler.ts`, handlers; `caide_goals`/`caide_goal_runs`/`caide_goal_events` tables. NOTE: dyad executes goals in the RENDERER (GoalRuntimeBridge claims runs) — RE-HOST executor engine-side (claim/heartbeat/complete over protocol)
- MCP: `mcp_manager.ts`, OAuth provider/flow, `mcp_consent.ts`, `mcp_tool_utils.ts`, `mcpservers` table
- Compaction: `compaction_handler.ts` + storage/utils; mid-turn compaction via `prepareStep`
- Prompts+skills: `system_prompt.ts`, `local_agent_prompt.ts`, `plan_mode_prompt.ts`, `checkpoint_chain.ts`, `flutter_skill_pack.ts`, `mobile_ui_skill_pack.ts`, `ai_rules.ts`, guides/skills dirs
- App model: `apps/chats/messages` drizzle schema (better-sqlite3), `AiMessagesJsonV6`, chat-mode resolution, create-app flow (`createApp`: slug → `getCaideAppPath` → insert app → insert first chat → `createFromTemplate` (flutter template) → git init + initial commit → initialCommitHash backfill)
- Flutter layer: `processors/flutter.ts` (analyze), `flutter_tests.ts`, `flutter_utils.ts`, `executeAddDependency.ts` (flutter pub add), `framework_utils.ts` (detect "flutter")
- Slash commands: `lib/slash_commands.ts` (`BUILTIN_SLASH_COMMANDS`, /goal ...) + `help_bot_handlers.ts`
- Settings: `main/settings.ts` (JSON file, Secret encrypt/decrypt; safeStorage → server-forwarded)

### Transport seams (the ONLY rewrites)

1. `IpcMainInvokeEvent` type → `{ sender: MessageSender }` interface (types-only mostly)
2. `safeSend(event.sender, channel, ...)` → engine notification emitter (JSON-RPC notifications over stdio)
3. `safeStorage`/keychain → engine settings via `initialize` handshake from server launch config
4. `BrowserWindow` — only hard use: `capture_screenshot.ts` → drop or CDP/Playwright
5. Goals scheduler `webContents.send`/`Notification` → event bus → engine notifications
6. Renderer-driven goal executor → engine-side executor; web `GlobalGoalCenter` calls `ipc.goal.*` over WS
7. `getDyadAppPath` → `~/caide-apps` engine-owned apps root; engine owns its SQLite

### apps/server = thin supervisor

- `EngineAdapter` rewritten to the full dyad surface: mode routing (ask/plan/build/local-agent → engine chat stream), consent round-trips → ComposerPendingApprovalPanel, user-input round-trips (planning questionnaire, ask_env_vars), goals events → GlobalGoalCenter, XML preview/todos/logs → existing stream panels; emits Caide orchestration events unchanged where the UI expects them
- REMOVED: 27 adapters + codex manager + old agentLoop wiring

### apps/web = wiring only

- Replace goals stubs with WS-backed `ipc.goal.*` (getActiveGoal/createGoal/editGoal/listGoals/listActivity/pause/resume/retry/verify/cancel)
- Rebind settings panels (providers/models/consent/MCP) to dyad `providerSettings`/`selectedModel` schema
- Approvals/user-input → existing panels; slash commands → dyad registry + help bot; mode selector already matches (`local-agent|plan|build|ask`)

## App Projects product model (M3b/M4a/M4b)

- Server: `appsDirectory` config (default `~/caide-apps`, lazily created); `app.create` orchestration mirroring dyad create-app; engine `app/create` (Flutter scaffold) already exists
- `CreateProjectDialog` → create-app dialog (name + template, Flutter-first); path-browse/GitHub-provision out of the main flow (legacy stays functional)
- Sidebar: flatten — Projects (newest first, cap 8 + "See more"), per-project DisclosureChevron (repo-standard disclosure motion) → last 5 chats (desc createdAt) + "See more" (reuse THREAD_PREVIEW_LIMIT/pager). Same layout whether or not a project is open. Legacy folder projects render identically.
- Activity view: main-pane per-project timeline, day-grouped dot rows: chat events, goal-run events (plan/execute/repair/verify + statuses from caide_goal_events), git commits, engine build/analyze/test results. New server-side per-project activity query.
- Chat "recent" = createdAt desc (dyad has no updatedAt on chats)

## Milestones (commit after EACH)

- M0 ✅ commit running state (2 config fixes) + gitignore leftovers + plan 013 + AGENTS.md update + branch `feature/backend-transplant`
- M1 Import dyad backend into apps/engine under transport abstraction; engine boots headless; smoke over JSON-RPC. Risks: AI SDK v6/drizzle/better-sqlite3/node-pty under bun
- M2 Expanded engine protocol: chat stream, streaming events (text deltas/reasoning/XML preview/todos), consent:request/response, user-input:request/response, compaction, MCP consent, goal claim/heartbeat/complete
- M3 Server: EngineAdapter rewrite; M3b app-project model (caide-apps, app.create orchestration); remove 27 adapters + codex manager + old agentLoop
- M4 Web: goal stubs → WS, settings rebind, approvals/user-input, slash commands; M4a sidebar redesign; M4b Activity view
- M5 Flutter tool suite E2E: create app → build → preview → goals run → approvals → settings persist; quality-gate panels
- M6 Verification: bun fmt/bun lint/bun typecheck, Playwright smoke, final commit
