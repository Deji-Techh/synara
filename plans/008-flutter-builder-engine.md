# Plan 008: Flutter Builder — Synara UI × Rebuilt Caide Engine

> **Status**: IN PROGRESS (execution started 2026-08-12)
> **Priority**: P0 — this is the product
> **Effort**: XL (multi-week, staged)
> **Depends on**: none (greenfield engine inside existing monorepo)

## Mission

Rebuild the Caide (dyad x caide) engine as a **Flutter application builder** and
plug it into **Synara's UI** as a new provider. The previous dyad×caide product
failed because its build target was web apps; the new engine targets **real
Flutter applications** (Dart, widgets, emulator/simulator preview, APK/IPA
builds).

Synara's UI stays untouched. Synara's server keeps its orchestration. The
engine is a **new spawned process** (same pattern as `codex app-server`:
JSON-RPC over stdio) that the server supervises.

## Decisions locked (debated 2026-08-12)

| #   | Question           | Decision                                                                                                                                                                     |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Engine location    | **In-monorepo** — new `apps/engine` package in this repo (bun workspaces, turbo). One install, shared `@synara/contracts`.                                                   |
| B   | Database           | **Engine keeps its own SQLite** (messages, apps, preview state, settings). Synara keeps the event store. Adapter projects engine events into `ProviderRuntimeEvent` stream.  |
| C   | External providers | **Strip for v1.** The engine IS the product. Remove non-engine provider adapters from the active product path (code remains in git history).                                 |
| D   | Android emulator   | **Build it** — `adb` + `avdmanager` + `flutter run -d emulator`, `adb exec-out screencap` screenshots. iOS Simulator comes free via Synara's existing `IosSimulatorBackend`. |
| E   | Flutter SDK        | **Pinned SDK** (a known-good Flutter stable version), downloaded/managed by the engine (mirror `managed_android_toolchain_service` pattern). FVM later.                      |
| F   | Model routing      | **User API keys** via Synara's existing Settings provider section. No free-tier/Dyad-engine gateway in v1.                                                                   |

## Architecture

```
┌─────────────────────────── Synara (kept) ────────────────────────────┐
│  apps/desktop — Electron shell                                      │
│  apps/web     — React UI (sidebar, chat, right dock, settings)      │
│  apps/server  — Effect-TS orchestration, WS RPC, persistence        │
│   └─ ProviderAdapterRegistry ─► NEW: engineAdapter (our code)       │
│        │  spawns apps/engine + JSON-RPC over stdio                  │
│        └─ projects engine events → ProviderRuntimeEvent stream      │
└──────────────────────────────────────────────────────────────────────┘
                              │ stdio JSON-RPC
┌─────────────────────────── apps/engine (NEW) ────────────────────────┐
│  agent loop — rebuilt from local_agent_handler.ts pattern            │
│  tools — file ops, sandbox, git, web, subagents, todos, plans        │
│  flutter — analyze / test / run / build / pub, toolchain manager     │
│  preview — flutter web-server + emulator + simulator, proxy, logs    │
│  persistence — own SQLite (messages, apps, settings, preview)        │
│  harness — ported vitest harness (fake LLM, no Electron)             │
└──────────────────────────────────────────────────────────────────────┘
```

## What we KEEP from Synara (no work)

- Full chat UI, composer, approvals, pending-input, transcript
- Right dock: Review/Diff, Terminal, Browser (CDP+automation), Files, Side chats, Git, PR, Device (iOS Simulator backend)
- Orchestration: event sourcing, checkpoints, subagents, forks, sidechats, plan mode
- MCP in both directions (`agentGateway`, `externalMcp`)
- Kanban, Automations, Spaces, Studio, Plugins, Settings
- Desktop: in-app browser, updater, AppSnap, split view, editor view

## What we PORT from Caide (rebuild, not copy)

| Caide source                                                   | Port as                                                                                | Effort |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| `local_agent_handler.ts` (2.4k LOC)                            | Rebuilt agent loop: streamText, stop-when, compaction, retry/replay, checkpoint passes | M      |
| `tool_definitions.ts` + `tools/` (~80 files)                   | Tool set; adapt analyze/test/dependency tools to Flutter                               | M      |
| `src/ipc/utils/sandbox/` (1.9k LOC)                            | Keep as-is (language-agnostic)                                                         | S      |
| `src/testing/chat_flow_harness.ts` + `hybrid_chat_harness.tsx` | Port verbatim — this is THE harness; fake LLM fixtures make 2.5s test loops            | S      |
| `app_runtime_service.ts` (1.7k LOC)                            | Rebuild: install → `flutter run` → proxy → log stream → kill                           | M      |
| Preview panel components                                       | Port into new Preview right-dock pane (see below)                                      | M      |
| `createFromTemplate.ts` + scaffolds                            | Replace with `flutter create` template + `AI_RULES.md`                                 | S      |
| Blueprint flow (`write_app_blueprint`)                         | Port — good for Flutter app specing                                                    | M      |
| `src/prompts/` skills + guides                                 | Rewrite `mobile_ui_skill_pack` → **Flutter skill pack**                                | M      |
| `native_release_service.ts` (1.6k LOC)                         | Replaced by `flutter build apk/appbundle/ipa` + signing                                | M      |

## What we REMOVE

**From Caide:** all renderer UI (~342 components / 72k LOC), Electron main
shell, i18n/PostHog/Figma/image-gen, Vercel/Supabase/Neon handlers, web3 skills

- scaffold-web3, Capacitor/native-release service, cloud preview services.

**From Synara:** nothing structural. Non-engine provider adapters removed from
the active path (v1).

## What we CAN build (Flutter path)

1. Scaffold: `flutter create` (org `dev.caide`, platforms android+ios+web) + pinned SDK + `AI_RULES.md`
2. Agent tools: `flutter analyze` / `flutter test` / `flutter build`, `pub add`, Dart-aware prompts
3. Preview layer 1 (fast loop): `flutter run -d web-server` → proxy → iframe preview with DeviceLab presets; parse `flutter run` output into Console; hot reload/restart (`r`/`R`)
4. Preview layer 2 (real devices): Android emulator backend (adb screencap), iOS Simulator via Synara device pane
5. Quality gates: `flutter analyze` + `flutter test` exit codes → QualityGatePipeline
6. Release: `flutter build apk/appbundle/ipa` + signing → ReleaseCentre-style panel

## What we CANNOT build (v1)

- Visual editing / DOM annotator on Flutter (CanvasKit has no DOM). Future: Flutter DevTools widget-inspection (DDS) — research spike, not v1.
- iOS builds on Linux (Xcode-only; respect Synara's existing off-macOS gating).
- Cloud preview of mobile builds (web preview can cloud-preview later).
- Real-time hot-reload introspection via DDS (defer behind web-server + screenshots).

## Preview pane in the right dock

1. Add `preview` kind to `apps/web/src/rightDockStore.logic.ts` (kind union + state: selectedAppId, mode, device preset)
2. `rightDockPaneMeta.tsx`: label/icon entry
3. `SingleChatSurface.tsx` renderPane `case "preview"`
4. Port Caide's `PreviewPanel` stack (PreviewToolbar, DeviceLab, Console, Problems, TestsPanel, QualityGatePipeline, FileTree, FileEditor) restyled to Synara's design tokens (Tailwind v4 + Base UI on both sides)
5. Engine exposes preview RPC (start/stop/reload/log-stream/analyze/test-results); adapter forwards; UI consumes via WS RPC (new methods in `wsRpc.ts`, respecting `docs/server-architecture-migration.md` compatibility rules)

## Import order (how to do it carefully)

1. **Spike (2–3 days)**: engine spawn + hello-world JSON-RPC over stdio through a stub adapter; prove the Codex pattern fits
2. Port **harness first** (fake-LLM vitest harness) — verification backbone for everything else
3. Engine skeleton: agent loop (no tools) + `flutter create` scaffold → "build a hello-world Flutter app" E2E via harness
4. Tools in dependency order: file ops → analyze/test → pub → run_command
5. Preview: web-server mode + proxy → Console/DeviceLab → devices → quality gates → release
6. Only then UI work: Preview pane + provider settings entry

## Milestones

- M0: This plan + AGENTS.md committed
- M1: Engine package skeleton + stdio JSON-RPC + stub adapter + hello-world round trip (vitest green)
- M2: Harness ported; agent loop runs with fake LLM; `flutter create` scaffold tool
- M3a: Tool system — write_file/read_file/list_files + flutter_analyze/flutter_test, multi-step loop via AI-SDK `stopWhen` (DONE; tests: `src/agent/tools/*.integration.test.ts`)
- M3b: Flutter hello-world app generated E2E + web-server preview (DONE; `preview/start` + `preview/stop` RPC in `src/protocol.ts`, `src/preview/webServerPreview.ts`; tests: `src/preview/webServerPreview.test.ts`, `src/preview/webServerPreview.integration.test.ts`, `src/webServerPreview.spawn.test.ts`)
- M4: Preview pane in right dock (web-server mode + DeviceLab + Console)
- M5: Android emulator backend + iOS Simulator preview + screenshot tool
- M6: Quality gates + release builds (apk/appbundle) + signing
- M7: Flutter skill pack prompts + hardening + polish

## Verification baseline

- Repo rules from `AGENTS.md` apply (bun run test, not bun test; fmt/lint/typecheck on explicit request; bundle into one final pass)
- After EVERY major change: commit (user requirement, permanent)
- After EVERY compaction: re-read AGENTS.md and this plan (user requirement, permanent)
- Engine tests run through the ported harness: `bun run test` in `apps/engine`

## Rejected alternatives

- **Embedding engine into apps/server**: rejected — drags two DI systems (Effect vs plain TS), two DBs, two build pipelines into one process.
- **Separate engine repo**: rejected — one `bun install`, turbo runs all tests, shared contracts.
- **Keeping web-app target**: rejected — the failure mode of the previous product.
- **Keeping external providers**: rejected for v1 — engine is the product; code stays in git history.
