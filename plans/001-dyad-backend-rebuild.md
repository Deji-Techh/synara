# Caide Integrated Dyad Backend Rebuild

Status: IN PROGRESS

Last updated: 2026-08-25

Current branch: `feature/backend-transplant`

Pre-rebuild snapshot commit: `edf15bea`

## Mission

Keep Caide's current desktop shell and web UI/UX, but replace its complete
agentic backend with the known-working dyad×caide backend. The final product
must behave as smoothly as dyad×caide for conversation streaming, tool calls,
plan mode, ask mode, agent/build mode, approvals, user questions, compaction,
MCP, goals, retries, cancellation, and recovery.

The new runtime is integrated into Caide's server process. The current spawned
`apps/engine` process, JSON-RPC bridge, synthetic provider, duplicated SQLite
state, and `EngineAdapter` translation lifecycle must leave the active product
path. Caide's server remains the desktop/web host, but dyad's runtime becomes
the only agent lifecycle owner.

This is a clean backend generation. Existing Caide conversations do not need
to migrate into the new dyad data model. Old state may be archived for manual
inspection, but it must never participate in new turn execution.

## Repository Locations

### Target product

- Root: `/home/DejiTech/Caide final`
- UI: `/home/DejiTech/Caide final/apps/web`
- Integrated backend target: `/home/DejiTech/Caide final/apps/server`
- Old engine to retire: `/home/DejiTech/Caide final/apps/engine`
- Shared contracts: `/home/DejiTech/Caide final/packages/contracts`
- Desktop shell/packaging: `/home/DejiTech/Caide final/apps/desktop`
- Active plan: `/home/DejiTech/Caide final/plans/001-dyad-backend-rebuild.md`
- Release artifact: `/home/DejiTech/Caide final/release/Caide-0.0.1-x86_64.AppImage`

### Authoritative source backend

- Root: `/home/DejiTech/dev/personal projects/dyad x caide`
- Git revision at planning time: `e1fed18f`
- Source backend: `/home/DejiTech/dev/personal projects/dyad x caide/src`
- Chat lifecycle: `src/ipc/handlers/chat_stream_handlers.ts`
- Agent loop: `src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts`
- Agent tools: `src/pro/main/ipc/handlers/local_agent/tools`
- Tool definitions: `src/pro/main/ipc/handlers/local_agent/tool_definitions.ts`
- Database/schema: `src/db` and `drizzle`
- Providers/models: `src/ipc` model/provider helpers and settings modules
- Prompts/skills: `src/prompts` and `src/pro/main/prompts`
- Compaction: `src/ipc/handlers/compaction`
- MCP: `src/ipc` MCP services/handlers
- Goals: `src/ipc/goal`
- Source repository has user changes. Treat it as read-only and never commit,
  format, clean, or otherwise modify it during the transplant.

### Secondary references

- Kimi Code lifecycle reference: `/home/DejiTech/dev/kimi-code`
- Generated app root: `/home/DejiTech/caide-apps` by default

## Locked Product Decisions

1. Caide's current UI and UX remain the visual product shell.
2. Dyad×caide is the behavioral source of truth for the agent runtime.
3. The dyad runtime runs inside `apps/server`; there is no separate engine
   process in the final active architecture.
4. New backend state starts clean. No conversation migration is required.
5. API-key providers are supported. Provider-specific CLI agent runtimes are
   not part of the new active path.
6. Every project has one immutable framework chosen at creation.
7. Framework choices are `blank`, `react-native`, `flutter`, and `website`.
8. Every chat inherits its project framework.
9. The sidebar shows the framework icon beside chat names instead of a model
   or provider logo.
10. Framework selection controls scaffolding, prompts, tools, dependencies,
    preview, testing, build commands, devices, and distributable artifacts.
11. The existing old backend is removed only after the integrated runtime has
    passed replacement acceptance tests.
12. Work is committed in small milestones. This file is updated after every
    meaningful code change so another agent can resume without hidden context.
13. Project and chat boundaries are strict security boundaries. Project state
    never crosses projects, and chat state never crosses chats, including two
    chats belonging to the same project. This applies to persisted messages,
    streamed output, lifecycle state, tools, approvals, questions, previews,
    builds, artifacts, goals, MCP activity, and recovery after restart.

## Target Architecture

### Single runtime owner

`apps/server` hosts a new `dyadRuntime` module containing the imported backend.
It owns apps, chats, messages, turns, tools, approvals, user questions, goals,
MCP sessions, model configuration, and compaction. A turn has exactly one
lifecycle controller and exactly one terminal settlement.

The server exposes the runtime to `apps/web` through Caide's existing WebSocket
transport. The adapter is intentionally narrow: validate requests, call dyad,
and translate dyad notifications into UI events. It must not infer lifecycle
state from empty messages or maintain a second competing turn state machine.

### Event lifecycle

Every turn follows:

`created -> running -> waiting (optional) -> running -> terminal`

Terminal is exactly one of `completed`, `failed`, `cancelled`, or `aborted`.
Text, reasoning, tool activity, approvals, user input, plans, todos, file
changes, builds, and previews are child events of the turn. Stream completion
without visible output becomes a failed turn with an actionable error.

On restart, the runtime reconciles non-terminal turns once. It persists a
terminal recovery state and never repeatedly prints stale-running notices.

### Framework registry

Create one shared project framework contract:

```ts
type ProjectFramework = "blank" | "react-native" | "flutter" | "website";
```

Each framework definition supplies:

- stable ID, label, description, and icon;
- scaffold/create handler;
- framework detection and validation;
- system prompt additions and skill packs;
- enabled/disabled tools and tool behavior;
- package/dependency commands;
- analyze/lint/test commands;
- development server or device launch strategy;
- preview adapter;
- release build actions and artifact metadata.

Framework selection is stored on the app/project record, never inferred on
each message, and cannot be changed after creation.

#### Blank

Creates an empty managed directory and minimal project metadata. The agent may
choose an implementation later, but the project remains framework `blank`
until a future explicit migration feature is designed. Preview/build actions
stay unavailable until the workspace is recognizable.

#### React Native

Uses the working mobile behavior from dyad×caide: Expo/React Native prompts,
tools, Metro/dev-server handling, device preview, package management, native
build commands, and mobile-specific validation.

#### Flutter

Uses Flutter scaffolding, Dart/Flutter prompts and skills, `flutter pub`,
`flutter analyze`, `flutter test`, emulator/iOS Simulator preview, APK, app
bundle, and IPA/release actions where the local toolchain supports them.

#### Website

Uses dyad's web app scaffolding and proven browser preview flow, Node package
management, web build/test commands, and browser-oriented tools.

## Public Contracts and Persistence

- Add `ProjectFramework` to shared contracts and persist it on every new app.
- Project creation accepts `{ name, framework }`; template choice is derived
  from the framework registry rather than free-form UI values.
- Chat creation references an app/project and inherits its framework.
- Turn requests carry mode and chat identity. Framework is resolved server-side
  from the app record and cannot be overridden by a message.
- Runtime notifications expose explicit turn ID, chat ID, lifecycle status,
  message deltas, tool IDs, tool status, approval/user-input request IDs, and
  terminal error/cancellation information.
- Preview/build APIs accept project identity and route through its framework
  adapter. Callers do not select arbitrary preview/build implementations.
- The new dyad runtime uses a fresh database namespace/path. The old Caide
  orchestration database is never silently interpreted as the new schema.
- Every engine chat ID has exactly one owning Caide thread and project. A
  persisted mapping is accepted only after its app/project ownership is
  verified; a new thread creates a new engine chat and never adopts an
  arbitrary existing or "first" chat.
- Runtime state is keyed by project, thread, chat, and turn where applicable.
  Message IDs, tool IDs, approval IDs, question IDs, and build IDs are not
  treated as globally sufficient routing keys unless the runtime guarantees
  and validates their global uniqueness.
- Database integration state shown in the existing right-sidebar Database pane
  is owned by the project, not by an individual chat. Neon/Supabase links and
  branch selection persist when switching between chats in that project, but
  another project cannot list, read, mutate, or inherit those links.
- Preview and build requests identify a project. The server resolves the
  trusted workspace and framework from persistence and rejects caller-supplied
  paths or artifacts that do not belong to that project.

## UI Integration

- Replace the current create-app choices with Blank, React Native, Flutter,
  and Website.
- Display the selected framework icon in project creation, sidebar chat rows,
  project headers, preview/build surfaces, and empty states.
- Preserve `ChatView`, `MessagesTimeline`, composer layout, plan UI, approval
  cards, question cards, work logs, tool rows, goals UI, and disclosure motion
  where possible. Rewire their data rather than redesigning them prematurely.
- Tool rows render explicit running/completed/failed/cancelled states from the
  runtime. They never infer success from the presence of a blank assistant row.
- Provider errors show the actual provider/model response and retry guidance.
  A generic `Internal server error` is allowed only when no safer detail exists.

## Import Rules

1. Copy coherent dyad subsystems, including their tests, rather than copying
   isolated files and recreating hidden assumptions manually.
2. Preserve dyad's internal lifecycle and database semantics wherever possible.
3. Replace Electron IPC edges with a small in-process host interface:
   `invoke`, `notify`, cancellation signal, settings/secrets access, and paths.
4. Do not mix Effect and dyad Promise error APIs inside imported runtime code.
   Boundary conversion occurs only at the Caide service/WS edge.
5. Do not write into or commit changes in the source dyad repository.
6. Do not remove the old runtime until equivalent new behavior is verified.
7. Avoid broad compatibility shims. New state starts clean, so code should use
   the new schema directly.

## Detailed Work Checklist

### 0. Safety, documentation, and baseline

- [x] Commit all pre-existing target work before starting (`edf15bea`).
- [x] Identify authoritative dyad source repository and revision.
- [x] Remove superseded numbered plan documents.
- [x] Create this canonical plan and handoff checklist.
- [x] Update `AGENTS.md` to reference only this plan and new architecture.
- [x] Commit documentation reset (`dbc73a65`).
- [ ] Record current target tests/build failures as baseline evidence.
- [ ] Record dyad source smoke-test status without modifying its worktree.

### 1. Runtime package skeleton

- [x] Create integrated `apps/server/src/dyadRuntime` module boundaries.
- [x] Define runtime host interfaces for notifications, settings, secrets,
      filesystem paths, cancellation, and logging.
- [x] Confirm `apps/engine` already contains the coherent dyad backend and make
      it embeddable through `apps/engine/src/embedded.ts`; no second backend
      copy is being created.
- [x] Add project framework contract and registry skeleton.
- [x] Add a fresh runtime database path and startup ownership.
- [x] Add a minimal runtime health/startup test.
- [x] Wire the embedded runtime into the server provider layer.
- [x] Produce a self-contained `apps/engine/dist/embedded.mjs` bundle and add
      a server-side `EmbeddedEngineClient` seam; active adapter replacement is
      the next cutover step.
- [x] Update this checklist and commit milestone.

### 2. Dyad database and application model

- [ ] Import dyad schema, Drizzle configuration, and migrations coherently.
- [ ] Import app, chat, message, settings, MCP, goal, and compaction storage.
- [x] Add immutable framework column to apps/projects.
- [x] Implement clean initialization and transactional app/chat creation.
- [x] Add framework-aware app queries and chat inheritance.
- [ ] Test clean database boot, restart, and CRUD behavior.
- [ ] Update this checklist and commit milestone.

### 3. Providers and model configuration

- [ ] Import dyad model clients, provider options, token accounting, and retry
      helpers.
- [ ] Bind Caide's secret/settings UI to dyad provider settings directly.
- [ ] Remove the synthetic `custom::caide-engine` provider from the new path.
- [ ] Support direct API-key/base-URL/model configuration per turn/runtime.
- [ ] Test provider initialization, invalid keys, transient failures, aborts,
      and readable error propagation.
- [ ] Update this checklist and commit milestone.

### 3A. Project and chat isolation

- [x] Give every project a unique persisted app ID and canonical workspace
      root, and reject any workspace outside that project's trusted root.
- [x] Enforce a one-to-one engine-chat-to-Caide-thread ownership invariant.
- [x] Remove arbitrary first-chat fallback and silently rebound chat mappings.
- [ ] Scope transcript offsets, current turns, terminal settlement, tool
      activity, approvals, questions, consent, todos, work logs, goals, and MCP
      events to their owning project/thread/chat/turn.
- [x] Reject notifications and pending-interaction settlements whose ownership
      cannot be proven from explicit identifiers. Pending approvals/questions
      now require thread ownership; consent resolutions also require chat
      ownership, and duplicate request IDs cannot rebind an existing request.
- [ ] Verify persisted engine chat mappings against their owning app/project
      during restart and create a fresh chat when no valid mapping exists.
- [x] Make preview/build/artifact APIs resolve their workspace server-side and
      prevent one project from operating on another project's files/artifacts.
- [x] Rebind the existing right-sidebar Database pane to the owning project:
      all chats in one project resolve the same database integration record,
      while list/read/connect/disconnect/branch operations cannot expose or
      mutate any other project's integration.
- [ ] Test two projects with unique workspaces and chats: activity in either
      project emits no events or messages into the other.
- [ ] Test two chats in one project: each has its own engine chat, streamed
      transcript, current turn, tools, interactions, and terminal settlement.
- [ ] Test restart restoration without chat ID reuse or first-chat fallback.
- [x] Test that approval, question, and consent responses from chat A cannot
      settle a pending interaction in chat B (including request-ID collision
      protection and missing/mismatched chat IDs).
- [x] Test that arbitrary preview/build paths and artifact IDs cannot cross
      project ownership boundaries.
- [x] Test database persistence across two chats in one project and complete
      database isolation between two different projects.
- [ ] Update this checklist and commit milestone.

### 4. Complete chat and agent lifecycle

- [ ] Import `chat_stream_handlers` and its required helpers.
- [ ] Import `local_agent_handler` as a coherent subsystem.
- [ ] Port ask, plan, build/agent, and follow-up modes.
- [ ] Port streaming text, reasoning, message persistence, retry/replay,
      cancellation, and finalization.
- [x] Guarantee exactly one terminal settlement per turn across response,
      transport-error, cancellation, empty-response, and stream-end races.
- [x] Add restart reconciliation without repeated stale-state recovery. ProviderRuntimeReconciler now suppresses duplicate activity when session already matches and updates timestamps to avoid frozen staleness clock; EngineAdapter uses claimChatSettlement for all terminal paths including chat:response:end.
- [ ] Test greeting, normal response, empty response, provider error, abort,
      restart, concurrent chats, and mode switching.
- [ ] Update this checklist and commit milestone.

### 5. Complete tool system

- [ ] Import all dyad tool definitions and implementations required for the
      four framework modes.
- [ ] Port tool approval and permission policy.
- [ ] Port user questions/environment-variable requests.
- [ ] Port todos, work logs, file changes, terminal activity, subagents, and
      background task events.
- [ ] Enforce plan/read-only restrictions using dyad's tool metadata.
- [ ] Test tool success, failure, timeout, cancellation, consent, and resume.
- [ ] Update this checklist and commit milestone.

### 6. Compaction, MCP, goals, and recovery

- [ ] Import compaction and mid-turn continuation.
- [ ] Import MCP manager, OAuth/configuration, tool discovery, and consent.
- [ ] Import goals storage, scheduler, execution, heartbeat, and activity.
- [ ] Port checkpoint-chain behavior and plan implementation flow.
- [ ] Test long chat compaction, MCP failure/reconnect, goal restart, and
      terminal recovery.
- [ ] Update this checklist and commit milestone.

### 7. Framework-aware projects

- [x] Replace the public Flutter-template creation API and dialog with the
      four locked framework choices.
- [x] Implement Blank project creation.
- [ ] Port React Native/Expo scaffold and runtime behavior from dyad.
- [x] Implement Flutter scaffold and runtime behavior through the existing
      dyad Flutter toolchain path.
- [x] Port initial Website scaffold and browser project shape.
- [x] Add framework-specific prompts, skills, tools, commands, and dependency
      handling.
- [x] Add immutable framework persistence and validation.
- [x] Test Blank, React Native, Website creation; Flutter remains covered by
      the existing engine scaffold tests.
- [ ] Update this checklist and commit milestone.

### 8. Preview and build routing

- [x] Add framework-aware preview routing inside the current preview host.
- [x] Route Blank to an explicit unavailable/detection state in the preview
      surface; no engine start request is sent for an unrecognized workspace.
- [x] Route React Native/Website Node projects to the browser dev-server
      preview path; React Native's Expo web target uses the same browser
      surface while retaining mobile-oriented agent prompts and builds.
- [ ] Route Flutter to emulator/iOS Simulator and Flutter device tooling.
- [x] Route Website to browser dev-server preview.
- [x] Route React Native/Expo to the same browser preview surface as Website,
      while preserving native-app prompts and native build targets.
- [ ] Add Flutter APK/AAB/IPA actions.
- [x] Add React Native/Expo Android APK and app-bundle build actions supported
      locally (`expo prebuild` + Gradle release tasks). iOS still requires the
      macOS/Xcode export acceptance pass below.
- [x] Add Website production build artifacts (Node `build` script output is
      archived as a stable `.tar.gz` artifact and registered like mobile builds).
- [ ] Test start, stop, restart, port conflict, crash, and build failure states.
- [ ] Update this checklist and commit milestone.

### 9. Caide web wiring

- [ ] Rebind chat submission and streaming to integrated dyad runtime events.
- [ ] Rebind modes, approvals, user input, tools, todos, goals, and MCP.
- [ ] Replace create-app choices with the four frameworks.
- [x] Add shared framework icons and replace sidebar model icons.
- [ ] Rebind preview/build controls to framework capabilities.
- [x] Keep the existing right-sidebar Database UI and make its data source
      project-scoped rather than thread-scoped or globally enumerated.
- [ ] Preserve transcript scroll and performance guardrails.
- [ ] Add focused UI tests for explicit lifecycle states.
- [ ] Update this checklist and commit milestone.

### 10. Cutover and deletion

- [x] Make integrated dyad runtime the default provider/runtime path.
- [ ] Remove active use of `EngineAdapter` and child engine supervision.
- [ ] Remove engine JSON-RPC protocol and duplicate settings/state bridges.
- [ ] Remove obsolete server provider adapters and Codex/CLI active paths.
- [ ] Stop packaging the old engine payload.
- [ ] Archive or delete obsolete code only after replacement tests pass.
- [ ] Update this checklist and commit milestone.

### 11. Acceptance and release

- [ ] Clean-state app starts without migration/schema repair errors.
- [ ] Create Blank, React Native, Flutter, and Website projects.
- [ ] Framework icons display consistently and persist after restart.
- [ ] `hey` works in ask, plan, and agent/build modes.
- [ ] Text and tool streaming remain ordered and visible.
- [ ] Approvals and questions suspend and resume the same turn.
- [ ] Cancellation produces no stale running state.
- [ ] Provider failures persist a visible failed response with useful detail.
- [ ] Two projects and multiple chats can run concurrently and across restart
      without any messages, streams, tool events, interactions, workspace
      access, previews, builds, or artifacts crossing their ownership boundary.
- [ ] Long conversations compact and continue.
- [ ] MCP and goals operate across restart.
- [ ] React Native preview/build works.
- [ ] Flutter preview and APK build work.
- [ ] Website preview/build works.
- [ ] Run focused tests throughout implementation.
- [ ] Run final `bun fmt`, `bun lint`, and `bun typecheck` once.
- [ ] Build AppImage and run clean-profile desktop smoke test.
- [ ] Update final handoff and commit release state.

## Handoff Log

### 2026-08-24 — framework persistence and scaffolds

- Added an immutable `apps.framework` field with startup repair for older fresh
  namespaces.
- Dyad `create-app` now accepts the framework and routes scaffolding to Blank,
  React Native/Expo, Website/Vite, or the existing Flutter path.
- Added server/engine creation tests for Blank, React Native, and Website.
- Preview routing now selects the browser adapter for Website and React Native
  Node projects through their `dev`/`web`/`start` scripts; native Expo device
  builds remain a separate build/launch milestone.
- Restored the platform-contract selector: Flutter gets the Dart/Flutter
  contract, Website/Vite gets the responsive web contract, and React Native's
  non-web target gets the native-feel mobile contract. Prompt snapshots were
  updated and pass.
- Added orchestration migration 93 and project projection fields so framework
  survives server restart and is available to every chat's owning project.
- Web normalization now retains framework, and pinned/standard sidebar rows
  render framework icons instead of provider logos. Server and web typechecks
  pass; one unrelated pre-existing Claude alias assertion remains in the broad
  store projection suite.

### 2026-08-24 — embedded runtime seam

- Added `apps/engine/src/embedded.ts`, an in-process API around the existing
  dyad handler graph (`invoke`, notifications, ping, shutdown).
- Added `apps/server/src/dyadRuntime/embeddedRuntime.ts` to own isolated state
  and project paths from the server host.
- Added a boot/ping/shutdown test. The old child-process adapter remains active
  until provider-layer cutover is complete.
- The first adapter experiment was intentionally rolled back after build
  validation exposed that server bundling cannot yet resolve the engine's
  Electron/path aliases. The embeddable seam remains isolated and tested; the
  provider cutover is deferred until a shared bundle strategy is in place.
- The embedded bundle now builds independently (`apps/engine/src/embedded.ts`)
  and `apps/server/src/dyadRuntime/embeddedEngineClient.ts` can load it without
  importing engine source aliases into the server bundle.
- Server build now builds/contracts the engine embedded entry and stages its
  self-contained chunks under `apps/server/dist/dyad-engine`. A packaged-style
  direct load smoke test reaches database initialization, handler registration,
  ping, and clean shutdown.
- The server's default `EngineAdapter` path now selects the embedded client and
  passes a focused start-session test. The test harness mounts the production
  projection dependency, and embedded migration discovery supports both the
  packaged staged directory and the source checkout's authoritative engine
  `drizzle` directory.
- Embedded Git operations now fall back to the system `git` executable when
  dugite's bundled binary is unavailable in a server/AppImage bundle. This
  removes an ENOENT failure that previously aborted every turn before model
  execution.
- Fixed the stream bridge to consume dyad's real tail-patch shape
  (`{ offset, content, prefixHash }`) instead of looking for a nonexistent
  `text` field. The adapter tracks emitted length by the placeholder assistant
  message ID, so final transcript snapshots do not duplicate streamed text.
- Focused lifecycle acceptance now proves non-empty assistant deltas and one
  completed terminal event for build, ask, plan, and local-agent modes using
  the embedded runtime.
- The preview stage now receives the persisted project framework. Website and
  React Native render a browser-style surface with framework-specific copy and
  controls; Flutter retains the device frame/toolchain banner; Blank shows an
  explicit unavailable state instead of attempting a Flutter launch.
- Renderer project fixtures remain compatible with pre-framework snapshots by
  treating a missing framework as `blank` at the UI boundary; normalized server
  projects still persist the immutable framework value.
- Added the `web` build target and artifact kind across engine, contracts,
  server registry, and UI. Website release controls now select the web bundle
  target and the engine runs `npm run build`, archives `dist/` or `build/`, and
  exposes the resulting tarball for download.
- React Native keeps the shared browser preview but now exposes app release
  controls. Android release builds run Expo prebuild followed by
  `assembleRelease` or `bundleRelease`, locate the APK/AAB, hash it, and feed
  it through the same stable artifact pipeline as Flutter.

Validation notes:

- `apps/server`: focused embedded/framework tests pass (4 tests).
- `packages/contracts`: project framework tests pass (2 tests).
- `apps/server`: `bun run typecheck` passes.
- `apps/engine`: `bun run build` passes.
- `apps/server`: focused default embedded start-session test passes.
- `apps/server`: embedded send-turn streaming and all explicit mode cases pass.
- `apps/engine`: native Git behavior tests pass with the embedded fallback.
- `apps/web`: typecheck passes after framework-aware preview wiring.
- `apps/engine`: preview host test suite passes.
- `apps/engine`: website build/archive integration test passes.
- `apps/server`: typecheck passes with the web target contract.
- `apps/engine`: Expo Android APK routing test passes with isolated fake
  prebuild/Gradle executables.
- The focused `EngineAdapter.test.ts` start-session case now mounts its required
  projection layer and exercises the embedded runtime. Remaining cases still
  need lifecycle-specific acceptance coverage as the adapter is simplified.
- The full focused adapter suite exposed two isolation-harness defects that
  must be fixed before its result is accepted: the embedded database resolved
  to `apps/server/userData/engine/sqlite.db` instead of the supplied fixture,
  and the Flutter creation case attempted a network package lookup. Tests must
  use per-case runtime/database roots and network-independent scaffolding.

### 2026-08-24 — project-scoped Database pane and chat ownership hardening

- Added explicit project/chat isolation requirements to the canonical plan.
- Right-sidebar Database operations now resolve the trusted project workspace
  from the Caide thread, return only that project's engine app, inject its app
  ID into operations, and reject mismatched app or Neon project IDs.
- Removed UI basename matching, which could select the wrong app when projects
  shared a folder name. Database state therefore persists across chats in one
  project through the same engine app row, but cannot cross projects.
- Engine chat binding no longer adopts the first chat returned by `get-chats`.
  Persisted IDs are accepted only when present under the resolved app, and a
  duplicate chat-to-thread ownership is rejected.
- Embedded adapter tests now pass explicit per-fixture data directory env vars;
  Flutter scaffold lookup walks the source checkout and tests can skip the
  network-dependent platform bootstrap.
- Validation: web typecheck passed. Server-wide typecheck remains blocked by
  existing engine alias/schema/type errors plus pre-existing projection fixture
  drift; no new error remains in the changed embedded-client call. Focused
  Vitest rerun was temporarily blocked by low disk space after prior builds.
- Added focused `wsDatabaseHandlers.isolation.test.ts`: project A/B receive
  only their own engine app rows, and a foreign app mutation is rejected.
- Preview start/build now ignore client-supplied workspace paths and use the
  project/thread workspace resolved from the server projection. Build-state
  lookup rejects a build ID not owned by the requesting thread.
- Focused database and preview ownership suites pass together: 12 tests.
- Framework prompt routing now preserves immutable project intent: Website
  receives a browser/responsive-web role and contract, React Native receives a
  native-feel mobile role and contract, and Flutter keeps its Dart contract.
  Plan mode receives the same framework-specific platform guidance.
- Engine bundle build passes after prompt routing changes. The existing
  `chat_mode_flow.test.ts` default-mode assertion still fails independently
  (`local-agent` versus its stale expected `build`) and remains documented
  rather than hidden.
- Rebuilt the dedicated embedded bundle (`bun tsdown --config
embedded-tsdown.config.ts`) and corrected the adapter boundary for dyad's
  numeric `create-chat` response. Full `EngineAdapter.test.ts` now passes 10/10
  tests, including streaming, explicit modes, lifecycle teardown, goals,
  subagents, Flutter creation, and credential bridging.
- Replaced the create-app dialog's four Flutter templates with the four locked
  framework choices and added framework to the app-creation RPC contract.
  Persistence and framework-specific scaffolding remain pending.

### 2026-08-25 — \_\_dirname and path-space AppImage fixes

- **Rename:** `Caide final` → `Caide-final` to remove space in path. The space caused `node-gyp` warnings (`Attempting to build a module with a space in the path`) and `electron-builder` packaging to hang at `dist/linux-unpacked`. All builds now run from `/home/DejiTech/Caide-final`.
- **Fix `ReferenceError: __dirname is not defined`:** `apps/engine/src/index.ts` already shimmed `__dirname` for the stdio entry, but `apps/engine/src/embedded.ts` and its bundled chunks (`tool_definitions`, `paths`, etc.) referenced `__dirname` directly in ESM. `tsdown` banner now injects `const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);` into both `tsdown.config.ts` (`dist`) and `embedded-tsdown.config.ts` (`dist-single`). Verified `apps/engine/dist-single/embedded.mjs` and `apps/engine/dist/*.mjs` each contain the shim at line 2-5 and `apps/server/dist/dyad-engine/embedded.mjs` copied via `apps/server/scripts/cli.ts build` now also contains it.
- **Build:** `bun --cwd apps/engine build` and `bun --cwd apps/engine tsdown --config embedded-tsdown.config.ts` rebuilt, then `node apps/server/scripts/cli.ts build --verbose` rebuilt server and bundled new `dist-single` into `apps/server/dist/dyad-engine`. `apps/web/dist` and `apps/desktop/dist-electron` remain present.
- **Next:** `bun fmt`, `bun lint`, full `turbo run typecheck`, then `node scripts/build-desktop-artifact.ts --platform linux --target AppImage --arch x64` (nospace path should now complete) and clean-profile smoke (`hey` in ask/plan/build, streaming, approvals, cancel, preview per framework).

### 2026-08-24 — Plan reset

- User approved replacing the entire unstable backend/engine path with the
  complete dyad×caide backend while keeping Caide's UI.
- Runtime decision: integrated into `apps/server`, not a child engine process.
- Data decision: fresh backend state; old conversations need not migrate.
- Framework decision: immutable project-level Blank, React Native, Flutter,
  or Website selection.
- UI decision: framework icon replaces model/provider logo in sidebar chats.
- Safety snapshot committed as `edf15bea`.
- Superseded plans removed and this canonical plan created.
- `AGENTS.md` now points only to this plan and describes the integrated,
  multi-framework product architecture.
- Milestone 1 skeleton added: `ProjectFramework` contract, framework registry,
  capability declarations, and `DyadRuntimeHost` boundary. Focused tests pass:
  2 contract tests and 3 registry tests.
- Next action: commit documentation reset, then establish baseline tests and
  create the integrated runtime skeleton.

## Known Current Failures (Old Architecture)

- Repeated provider `AI_APICallError: Internal server error` responses.
- Empty assistant messages incorrectly rendered as successful completion.
- Repeated stale running-state recovery.
- Provider/model provisioning ID mismatches and duplicate rows.
- Missing server Effect services in packaged builds.
- Migration registration/schema drift broke project and thread creation.
- Server and engine maintain competing lifecycle and persistence state.
- AppImage fixes frequently expose the next boundary mismatch.

These failures are evidence for replacing the boundary. They are not a list of
bugs to keep patching in the old runtime unless a temporary fix is required to
complete the transplant.
