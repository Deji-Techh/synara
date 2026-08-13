# 009 — Full Caide Feature Import

Objective: turn this app into a **full functional AI app builder for Flutter** —
it must generate the app, preview it, and build it. Import the feature set from
the legacy Caide (dyad) app, adapted to the Flutter/engine architecture, while
keeping everything Synara already has.

## Current state (what Synara already has — keep)

- Flutter engine (`@caide/engine`): agent loop with file/flutter tools, `flutter
create` scaffold, web-server preview (start/stop/reload/state), hello-world E2E.
- Preview pane in the right dock (`preview` dock kind, state machine, control
  panel) — M4 done.
- Providers: CLI-agent kinds `codex | claudeAgent | cursor | antigravity | grok |
droid | kilo | opencode | pi | engine` with approval policies + sandbox modes.
- Subagent/workflow system (composer subagent strip, WorkflowRunCard, agent
  activity), orchestration engine, git/browser/device/terminal/sidechat/fuzz,
  goals absent.
- Theme mode picker (light/dark/system) — no palette themes.
- Rebrand to caide complete; no `synara` identifier remains in code (only the
  workspace folder name `/home/DejiTech/synara`, which stays).

## Import map (Caide source → target)

| Feature                                     | Caide source                                                                                                                                                                                                                                   | Import as                                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat modes build / ask / local-agent / plan | `src/lib/chatMode.ts`, `src/components/ChatModeSelector.tsx`, schemas `ChatModeSchema`                                                                                                                                                         | Engine session `mode` + composer mode selector; local-agent = the engine agent loop (already the engine's behavior)                                                                                        |
| Doctor                                      | `src/components/DoctorDialog.tsx` (332)                                                                                                                                                                                                        | Toolchain health dialog (flutter/node/git checks via server)                                                                                                                                               |
| Themes                                      | `src/lib/uiThemes.ts` (system, codex, graphite, carbon, slate, oled-black, light, midnight, forest, aubergine)                                                                                                                                 | `uiThemeId` setting + swatch picker + CSS-var theme sets                                                                                                                                                   |
| API-key providers                           | `src/ipc/utils/get_model_client.ts` (chatgpt, openai, anthropic, xai, google, vertex, azure, deepseek, openrouter, ollama, lmstudio, bedrock, minimax), `src/components/settings/*` (ApiKeyConfiguration, ModelsSection, ProviderSettingsPage) | New provider adapters beside the CLI kinds + settings UI, keeping all existing CLI kinds                                                                                                                   |
| Goal system                                 | `src/ipc/goal/goal_scheduler.ts` (408), `src/components/goals/*` (GlobalGoalCenter 923, GoalRuntimeBridge 153, GoalTargetDialog 139)                                                                                                           | Goal CRUD + scheduler driving engine turns + goal center/vault UI                                                                                                                                          |
| Flutter build & publish                     | `src/components/preview_panel/QualityGatePipeline.tsx` (307), `ReleaseCentre.tsx` (583), `PublishPanel.tsx` (192), `TestsPanel.tsx` (1423), `Problems.tsx` (367), ConfigurePanel (772)                                                         | Flutter-adapted: quality gates = `flutter analyze` + `flutter test`; build = `flutter build apk/appbundle/ipa` + signing → release centre; tests/problems panels; publish = release builds (not web/cloud) |
| Preview pane modes                          | `PreviewToolbar.tsx`, `PlanPanel.tsx` (344), plan/                                                                                                                                                                                             | Preview/Console/Tests/Quality/Release/Problems/Plan tabs in the existing preview pane                                                                                                                      |
| Subagent team mode                          | `src/pro/main/ipc/handlers/local_agent/tools/subagent_runner.ts`, `team_manager.ts`                                                                                                                                                            | Stretch: parallel subagents inside the engine loop (Synara's composer subagents are kept)                                                                                                                  |

## Milestones

- M1: This plan committed. (DONE once this file is committed.)
- M2: Chat modes — `mode` on the thread/session (`build`|`ask`|`local-agent`|`plan`), engine routing (ask = no tools, plan = plan artifact, local-agent/build = current loop), composer ChatModeSelector.
- M3: Doctor — toolchain health (flutter/node/git) dialog wired to server env query.
- M4: Themes — `uiThemeId` in appSettings, full theme list + swatch picker, CSS-var application.
- M5: Flutter build & publish — engine `analyze`/`test`/`build` RPC; Problems/Tests/QualityGate/Release panels in the preview pane; `flutter build apk/appbundle/ipa` + signing.
- M6: API-key providers — generic api-adapter + first-class kinds (openai, anthropic, google, openrouter, ollama), then long tail (azure, vertex, bedrock, minimax, deepseek, xai, groq, lmstudio); settings UI (API key config + models section).
- M7: Goal system — scheduler + goal CRUD over WS + goal center/dialog UI.
- M8: Subagent team mode (optional stretch) + full verification pass + final polish.

## Verification

- Repo rules from `AGENTS.md` apply (`bun run typecheck` / `npm-run-style` per
  package, `bun run lint`, `bun run fmt`, tests per package, E2E after build).
- Commit per milestone.
