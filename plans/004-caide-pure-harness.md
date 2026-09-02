# Caide Pure Harness — Best Builder From Scratch (v4)

Status: ACTIVE — IN PROGRESS
Branch: `feature/shell-rebuild-v2` (cut from `feature/backend-transplant@c4a3e7da`)
Plan date: 2026-08-30
Source: `claudediscussion.md` (143 lines) + `~/Downloads/design.md` + `~/Downloads/agent-system-spec.md` + harness refs: `kimi-code` / `dyad x caide` / `claude-code` / `deepseek-harness-master`
Supersedes: `001-dyad-backend-rebuild.md` (transplant), `002-mobile-remote-connection.md`, `003-prompt-slim-skill-routing.md` — archived

---

## 0. Direction

We are **not transplanting dyad**. We are **not keeping the old harness**. We build a **pure Caide harness** from scratch in `apps/server/src/harness/*` + `apps/server/src/design/*`, keep **Electron desktop as window shell only** (`apps/desktop/main.ts:1`, `preload.ts:1`, `windowState.ts:1`, `ipcChannels.ts:1` remain), keep web dumb shell (`RouteInsetSurface`, `disclosureMotion 220ms`, `PreviewStage 672px`, `FrameworkIcon`, `ui/*` 43 primitives). Everything else (`orchestration:88`, `provider:172`, `agentGateway:108`, `checkpointing:11`, `automation:15`, `engine:652`) is stripped and rebuilt with the best patterns from 4 reference harnesses. This plan is the only active one.

**Goal:** best agentic app builder — smallest slice that proves loop end-to-end (RN-only, provider abstraction + state machine, Plan→Build Tier1, Builder→Verifier) then iterate to `perfect` (code-quality, security, perf, coherence, edge sweep, adversarial, benchmarking, motion, data-model, self-improving loop, eval A/B, RTL, team, legal) — per `claudediscussion.md:129-136`.

---

## 1. Locked Product Decisions

1. **Shell-only reset (desktop kept).** `apps/desktop` window shell stays (no harness stripping there). Web keeps `RouteInsetSurface/Sidebar/ChatView` chrome, `lib/disclosureMotion.ts:1` single source, `branding.ts`, `FrameworkIcon/CaideLogo`, `packages/contracts/{baseSchemas,projectFramework}`, `packages/shared/{formatBytes,path,text}`, `apps/web/public/*`, `scaffold/src/caide-ui/tokens.css`. All harness halves deleted.
2. **Framework-immutable.** `ProjectFramework = "blank"|"react-native"|"flutter"|"website"` on app row, inherited by every chat. Controls scaffold, prompts, tools, preview, build, artifacts. Never inferred per message.
3. **Framework owns preview/build.** `apps/server` resolves trusted workspace server-side; caller paths rejected — enforced per `M21`.
4. **One lifecycle owner.** After cut, `apps/server` owns `created→running→waiting(optional)→terminal{completed,failed,cancelled,aborted}` with exactly one settlement. No competing `EngineAdapter` vs orchestration. Steal `kimi-code` `TurnFlow` (`packages/agent-core/src/agent/turn/index.ts:1`) pattern: `activeTurn: ActiveTurn|'resuming'|null`, `steerBuffer`, `turnId` monotonic, `launch()` gate.
5. **Layered prompts as data.** `L0 Identity ~300-500tok` + `L1 Role` swapped per `Router|Planner|Builder|Verifier|Fixer` + `L2 Stage Context` by harness/state + `L3 Resolved Skills` atomic — `L0+L1` cached (`agent-system-spec.md:11`). `design.md:1` compiled to token JSON `{colorTokens, typeScale, componentRules, iconPack: phosphor-duotone, spacingUnit:4}` — Verifier does exact token compare, not vibes. Steal `deepseek` `system-prompt` registry (`section/context/variable/tools` + waterfall `system-prompt/assemble`).
6. **Human gates are real.** After design system + after first slice hard checkpoints. `CheckpointCard Approve/Request change/View diff` async. Low-confidence Verifier+Taste queues for glance.
7. **`AGENTS.md:1` points here only.** After commit, every session re-reads `AGENTS.md` + this file.

---

## 2. Architecture — What we steal (best harness synthesis)

```
apps/desktop (window shell only — keep 24 files)
    ↕ nativeApi bridge (thin IPC)
apps/server (single owner)
    ├─ harness/
    │   ├─ loop/           steal kimi-code stateless loop (run-turn.ts, turn-step.ts, retry.ts, llm.ts, events.ts)
    │   ├─ context/        steal kimi-code ContextMemory (projection ladder normal→media-degraded→media-stripped→strict)
    │   ├─ tools/          steal claude-code defineTool DSL + isConcurrencySafe(input) + ToolScheduler conflict graph
    │   ├─ session/        steal claude-code JSONL parentUuid chain + deepseek SessionEventMap append-only log
    │   ├─ prompts/        steal deepseek system-prompt registry (L0-L3 assembly) + kimi-code Blocks
    │   ├─ inbox/          steal deepseek Inbox next-turn vs next-step
    │   ├─ permission/     steal kimi-code policy chain yolo|manual|auto + claude-code SiblingAbort
    │   ├─ compaction/     steal dyad mid-turn compaction + kimi-code proactive @70%
    │   └─ router/         Router(cheap/fast) → Planner → Builder(per-slice fresh ctx) → Verifier(fresh ctx+render) → Fixer → Taste → Security/Perf
    ├─ design/tokens.ts    design.md → JSON injection
    ├─ framework/registry.ts blank|rn|flutter|website → scaffold, prompts, tools, preview, build
    └─ preview/            steal dyad fingerprintFiles + watchProjectTree (450ms debounce)
apps/web (dumb shell)
    RouteInsetSurface + SidebarFrameworkRows + ChatView{ComposerPill, TimelineTypedRows, PreviewStage672px, CheckpointCard}
    typed WS {token,tool_call,stage,checkpoint,artifact_updated} — dual token vs event channels + SIGTERM
packages/contracts  schema-only — no runtime
packages/shared     pure utils — no barrel
```

### 2.1 Why this beats `001` transplant

- **001** kept dyad debt: `chat_stream_handlers.ts:1300` router, `local_agent_handler.ts:1318` 4-deep nested loops, `Effect⋈Promise` mixing, `better-sqlite3` WAL, `execute_sandbox_script` multiplexer, `freeModelMode` branching. This harness is **stateless loop isolation** (`loop/` imports nothing from `agent/`), `defineTool` single schema, JSONL chain (cheap fork/resume), not SQLite-normalized.
- **Loop:** `kimi-code` `loop/run-turn.ts:1` while(true) over `turn-step.ts:1` one provider step + `retry.ts` exponential backoff + `shouldContinueAfterStop` priorities (budget→steers→Stop hook) — proven at `maxSteps` guard + `usage` aggregation.
- **Streaming:** `kimi-code` `events.ts:1` `LoopRecordedEvent` vs `LoopLiveOnlyEvent` + `BlockAssembler` + `LLMStreamTiming` TTFT split. Dyad `StreamingPatchTracker` throttled `DB_SAVE_INTERVAL_MS 150ms` but leaked fullMessages array — we send `content.part` durable + `text.delta` ephemeral via `safeEmitLive` (never breaks turn).
- **Tools:** `claude-code` `StreamingToolExecutor.ts:530` concurrency-safe per-input (`Bash(git status)` safe vs `Bash(rm)` unsafe) + `ToolScheduler` conflict graph + sibling `AbortController` hierarchy (`tool←sibling←query`) — eliminates dyad's all-parallel or all-serial mistakes.
- **Session:** `claude-code` `sessionStorage.ts:1416` JSONL + `parentUuid` chain + `recordTranscript` prefix filter + 100ms write-queue + `reAppendSessionMetadata` tail-window — replaces dyad's 7-table `schema.ts:1` over-normalization, enables cheap `buildConversationChain`.
- **Prompts:** `deepseek` `system-prompt/src/index.ts:1` section/context/variable/tools + `renderPrompt` strict `{{var}}` — replaces dyad's `$`-safe `replace("[[X]]")` + 3 duplicate `buildLocalAgent*SystemPrompt` variants.

---

## 3. Target UI integration — KEEP / STRIP (per audit)

| Area             | KEEP (dumb shell)                                                                                                 | STRIP                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Shell            | `RouteInsetSurface.tsx:1`, `ui/sidebar.tsx:1`, `disclosureMotion.ts:1`, `DisclosureRegion`, `FrameworkIcon.tsx:1` | `store.ts:1` harness, `wsTransport.ts:1` orchestration branches                                               |
| Timeline         | Empty `ScrollArea` shell, `Skeleton.tsx:1`                                                                        | `MessagesTimeline.tsx:1` + 8 browser variants, `AgentActivityDetailView.tsx:1`, `MessagesTimeline.logic.ts:1` |
| Composer         | Chrome `ComposerColumnFrame` empty textarea                                                                       | `composerDraftStore.ts:1`, `useComposerSlashCommands.ts:1`, `ComposerModelEffortPicker.tsx:1`                 |
| Preview          | `ui/preview-card.tsx:1`, `Empty.tsx:1` empty states                                                               | `PreviewStage.tsx:1`, `DiffPanel.tsx:1`, `BrowserPanel.tsx:1` wiring — rebuild via trusted workspace          |
| Settings         | `SettingsSidebarNav.tsx:1`, `ThemeModePicker.tsx:1`                                                               | `ProvidersSettingsPanel.tsx:1`, `ModelsSettingsPanel.tsx:1`, `ExternalMcpSettingsPanel.tsx:1` harness panels  |
| Contracts/Shared | `baseSchemas.ts:1`, `projectFramework.ts:1`, `formatBytes.ts:1`                                                   | `orchestration.ts:1`, `automation.ts:1`, `threadMarkers.ts:1`                                                 |

Desktop `apps/desktop/src` — **KEEP 24** (`main.ts:1`, `preload.ts:1`, `windowState.ts:1`, `ipcChannels.ts:1`, `desktopWsBridge.ts:1`); STRIP 107 harness (`backendSupervisionPolicy.ts:1`, `browserAutomation/*:28`, `browserAnnotations/*:11`, `updateMachine.ts:1`).

---

## 4. Prompts — L0-L3 as data

- **L0 Identity** ~300tok: who agent is, sandbox boundaries, output format. Cached.
- **L1 Role** per `Router|Planner|Builder|Verifier|Fixer|Taste|Security` — Builder: "you do not judge your own work — Verifier does".
- **L2 Stage Context** from state machine: stage, artifacts, exit gate.
- **L3 Skills** atomic per task: `ui-ux-mastery`, `motion-interaction`, `backend-production`, `anti-ai-slop` + `web3/*` 9 skills — registry `section({order:-100})` pattern.
- **Design injection** `design.md:1` → `tokens.json:1` — Verifier exact compare.

---

## 5. Tools — 18 core + framework-gated (steal defineTool)

Core: `read_file`, `list_files`, `grep`, `explore_code`, `write_file`, `search_replace`, `delete_file`, `rename_file`, `run_command`, `run_type_checks`, `git_status/diff/log/commit`, `update_todos`, `planning_questionnaire`, `capture_screenshot`. Framework adds `add_dependency` via `run_command` (no separate tool). Each `ToolDefinition<T>` has `inputSchema:zod`, `description` for model, `isConcurrencySafe(input)`, `isReadOnly`, `dangerCheck`, `isEnabled(ctx)`, `buildXml`, `timeoutMs 30s`, `maxOutputBytes 500k`. Double validation: schema + stage permission. Pre-digested results (error type/file/line/suggested fix).

---

## 6. Detailed Milestones — Pure Harness (M0-M27)

### M0 Shell reset (keep desktop)

- [ ] Archive `plans/001*`, `002-mobile*`, `003*` to `.plans/archive/` — only `004-caide-pure-harness.md` active
- [ ] Update `AGENTS.md:1,4,6,11` to point here, product = pure Caide harness
- [ ] Delete `~600` server harness files per §1 keep list (keep `auth/**`, `device` preview, `terminal` PTY, `git` pure, `persistence/Sqlite` infra, `effectServer.ts`, pure utils) — commit `chore: shell reset keep desktop`
- [ ] Keep `apps/desktop/src` intact — no deletion
- [ ] Regenerate `apps/engine/dist*` ignored (no checked bundles)

### M1 Scope contract

- [ ] `spec.md` gate: who, 3-5 core flows, platform, explicit v1 out-of-scope — `spec.md`+`architecture.md`+`manifest.json` source of truth

### M2 Architecture

- [ ] Framework registry `blank|react-native|flutter|website` immutable + detection + validation
- [ ] Evidence-based arch after 1-2 ugly screens confirm pattern

### M3 Design tokens

- [ ] `design.md:1` → `colorTokens/background #0D0D0D accent #E8493C typeScale headline24/bold componentRules emptyState/primaryButton iconPack phosphor-duotone spacingUnit4` JSON injection

### M4 State machine — steal TurnFlow

- [ ] `harness/turn/TurnFlow.ts` — `activeTurn: ActiveTurn|'resuming'|null`, `steerBuffer`, `turnId` monotonic, `launch()` gate, `turnWorker()→driveGoal()→runOneTurn()→runStepLoop()` + `isCompacting` latch
- [ ] Single `caideRunner` with `created→running→waiting→terminal{completed,failed,cancelled,aborted}` exactly one settlement; reconcile stale once

### M5 Prompts — steal deepseek registry

- [ ] `harness/prompts/registry.ts` `section/context/variable/tools` + `assemble({scope})` + `renderPrompt` strict `{{var}}`
- [ ] `L0+L1` cached, `L2(stage)+L3(skill)` dynamic; describe `L3` retrieval + `web3/skill packs`

### M6 Tools — steal defineTool + ToolScheduler

- [ ] `harness/tools/defineTool.ts` DSL + `tool-scheduler.ts` conflict graph + `StreamingToolExecutor.ts` per-input `isConcurrencySafe` + sibling abort
- [ ] 18 core tools with metadata `readOnly` + `failure modes` in description; double validation; pre-digested results

### M7 Roles — steal agent-loop inbox

- [ ] `Router(cheap/fast) → Planner → Builder(per-slice fresh ctx) → Verifier(fresh ctx+render never sees builder trace) → Fixer(targeted) → distinct harness voice`
- [ ] `Inbox` `next-turn` vs `next-step`, `followup/steer/inject/cancel/whenIdle`, `pre-step` waterfall `reject|enter`

### M8 Streaming — steal dual channels

- [ ] Separate `token(SSE)` vs `event(WS typed envelopes {token,tool_call{started|completed|failed},stage,checkpoint,artifact_updated})` + `BlockAssembler` + `SIGTERM` kill mid-tool
- [ ] `safeEmitLive` never breaks turn; `LLMStreamTiming` TTFT split

### M9 Compaction — steal proactive @70%

- [ ] Rolling summary not truncation `@70%` clean boundary + `artifact-over-conversation` + per-slice fresh ctx + ephemeral vs persisted decision left explicit
- [ ] `ContextMemory` invariant (`pendingToolResultIds` + `openSteps` + `deferredMessages`) + `projector.ts` media ladder

### M10 Slice loop

- [ ] One complete flow UI+state+data+edge per slice; retire horizontal anti-pattern

### M11 Visual verification — habit after every screen

- [ ] Live preview → screenshot → Verifier; poll fallback → push; slash `preview` entry

### M12 Unhappy paths

- [ ] Every screen ships `empty,loading,error,offline` per token rules

### M13 Human gates

- [ ] After design system + after first slice hard checkpoints; `CheckpointCard Approve/Request change/View diff` + async glance tier

### M14 Edge sweep (Edge Case Agent per slice, live preview primitives)

- [ ] Long text, missing data, degraded network, rapid double-tap

### M15 Adversarial self-play

- [ ] Hostile role `out-of-order, mid-flow back-out, force-close during network, malformed every field` → Fixer

### M16 Quality gates `7.5→8.9`

- [ ] `Edge sweep → Adversarial → Polish(Motion role) → Cross-app coherence(spacing/ dark-light/empty identical) → Security(hardcoded secrets/insecure storage/sanitization/exposed keys) + Performance(bundle, re-renders via Profiler/Flutter overlay, image opt, virtualization) → Comparative benchmark vs category leaders via same Taste model`

### M17 Motion

- [ ] Dedicated timing curves, swipe-to-dismiss, pull-to-refresh, haptics mapped

### M18 Data model

- [ ] Relationships normalized, missing constraints, supports every `spec.md` flow not just happy path

### M19 Taste+Confidence+Diff

- [ ] `Taste` separate cheap aesthetic vs `design.md`; confidence score per Verifier low-queues human glance; `Live diff staging` plain terms not raw diff

### M20 Cost/retrieval

- [ ] `L0+L1` prompt caching, semantic skill cache (`login→signup`), speculative 2-draft parallels for ambiguous slices, project decisions log `why`, cost-aware routing by budget

### M21 Preview/build routing — trusted workspace

- [ ] `Blank→unavailable explicit, RN Website → browser dev-server, RN+Flutter → device frame+(prebuild→Gradle assemble/bundle / flutter pub→APK/AAB/IPA), Website → Vite+build dist.tar.gz` — trusted workspace enforced, `fingerprintFiles` SHA256 + `watchProjectTree` 450ms

### M22 Polish

- [ ] Micro-interactions/transitions/haptics + a11y `contrast,tap, screen reader` after core flows

### M23 Self-improving loop

- [ ] Track skill combo → Verifier confidence vs Fixer retries → refine skills; across-project edge failures → stronger defaults

### M24 Evaluation

- [ ] A/B harness for any `skill/role/prompt/phase` change vs benchmark + `vitest` keyless snapshots of assembled app transcripts (steal deepseek `DSH_SNAPSHOT`)

### M25 Global concerns

- [ ] RTL/localization text expansion + mirror, team permissions + audit trails, license compatibility legal review

### M26 Acceptance

- [ ] Clean boot no migration repair, create `Blank/RN/Flutter/Website` persist icons, `hey` flows in `ask→plan→agent/build`, ordered token+tool stream, approvals/questions resume same turn, cancellation no stale running, provider failures visible with retry, 2 projects×N chats concurrent+restart with zero cross-talk, long-chat compaction+continue, preview+build per framework green, on-disk `design.md:PreviewStage` demo, `bun fmt/lint/typecheck` pass

### M27 V1 cut (if ship before perfect)

- [ ] `RN-only + Provider abstraction+state machine + Plan→Build Tier1 + Builder→Verifier only (no Fixer/Taste/Edge/Adversarial) + screenshot preview only + no deploy` — per `claudediscussion.md:129-136`

---

## 7. Build Order — Where 004 beats 001

1. **Steal kimi-code stateless loop first** — `harness/loop/` pure, testable with fake `LLM` (no Electron coupling)
2. **Steal claude-code QueryEngine + JSONL** second — session durability before UI wiring
3. **Steal deepseek tool DSL third** — 18 tools with `presentCall/presentResult` cards
4. **Then `002` M8-M13** — streaming + compaction + human gates
5. **No transplant debt** — no `Effect⋈Promise` mixing inside harness, boundary conversion at WS edge only (`002:7.4`)

---

## 8. Handoff

Next commit: `M0 Shell reset keep desktop` — archive old plans, update `AGENTS.md`, delete `~520` server harness files (keep desktop 24 + shell 180), create `apps/server/src/harness/*` skeleton + `apps/server/src/design/tokens.ts` empty, `bun typecheck` green. Then `M1-M5` harness loop.
