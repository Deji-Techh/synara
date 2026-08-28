# Caide Shell Rebuild — Perfect Builder (v2)

Status: IN PLANNING
Branch: `feature/shell-rebuild` (cut from `feature/backend-transplant@c4a3e7da`)
Plan date: 2026-08-28
Source convo: `/home/DejiTech/claudediscussion.md` (143 lines) + `~/Downloads/design.md` + `~/Downloads/agent-system-spec.md`

---

## 0. Direction (from `claudediscussion.md`)

We are done planning theory. V1 is the smallest slice that proves the core loop works end-to-end (RN-only, provider abstraction + state machine, Plan→Build Tier1, Builder→Verifier, screenshot preview). **Perfect** is everything the 4-doc conversation named as required for genuine `1%` excellence — code-quality, security, performance, cross-app coherence, systematic edge sweeps, adversarial self-play, comparative benchmarking, motion-as-role, data-model correctness, self-improving loop, plus the deeper gaps: model/prompt A/B Evals, RTL/localization as generation, team permissions, legal license review. `plans/001-dyad-backend-rebuild.md` is archived; this plan is the only active one.

---

## 1. Locked Product Decisions

1. **Shell-only reset.** Current desktop shell + web `RouteInsetSurface/Sidebar/ChatView` chrome stays. Every harness, agent loop, tool, system prompt, skill, compaction, MCP, goal, checkpoint, orchestration, provider, persistence, and preview-host server half is deleted. Only `apps/web/src/components/ui/*`, `lib/disclosureMotion.ts`, `branding.ts`, `FrameworkIcon/CaideLogo/RouteInsetSurface`, `packages/contracts/{baseSchemas,projectFramework}`, pure `packages/shared/{formatBytes,path,text}`, `apps/desktop/{main,preload}` window shell, `apps/web/public/*`, and `scaffold/src/caide-ui/tokens.css` survive as dumb presentational shell.
2. **Framework-immutable.** `ProjectFramework = "blank"|"react-native"|"flutter"|"website"` on the app row, inherited by every chat. Controls scaffold, prompts, tools, preview, build, artifacts. Never inferred per message.
3. **Framework owns preview/build.** `apps/server` resolves trusted workspace server-side; caller-supplied paths rejected — enforced per `M21`.
4. **One lifecycle owner.** After shell cut, `apps/server` owns `created→running→waiting(optional)→terminal{completed,failed,cancelled,aborted}` with exactly one settlement. No competing `EngineAdapter` vs orchestration state machine.
5. **Layered prompts as data.** `L0 Identity core ~300-500tok` + `L1 Role` swapped per `Router|Planner|Builder|Verifier|Fixer` + `L2 Stage Context` by harness/state + `L3 Resolved Skills` atomic — `L0+L1` cached (`agent-system-spec.md:11-26`). `design.md` compiled to token JSON `{colorTokens, typeScale, componentRules, iconPack: phosphor-duotone, spacingUnit:4}` — Verifier does exact token compare, not vibes.
6. **Human gates are real.** At minimum after design system and after first slice before burning budget. Checkpoint requires response. Low-confidence Verifier+Taste passes queue for async human glance (middle tier).
7. **`AGENTS.md` plan reference points here only.** After this file is committed, every future session re-reads `AGENTS.md` + this file.

---

## 2. Preview — KEEP `/preview`, prune the rest (`PreviewStage.tsx:1-1500` + `previewPanel.logic.ts`)

**Decision:** user-confirmed keep. Preview is the visual verification habit (`claudediscussion.md:25` continuous, not a phase). Client does not infer framework; `apps/server` does. Poll-merge stays interim but moves toward typed `artifact_updated` push (`M8`).

**Keep:** `PreviewStage.tsx` floating fixed `672px` stage beside transcript (mutually exclusive with any dock), branch-popup header (`tests|problems|qualityGate|release|terminal|home|rotate|screenshot|record|shutdown`), `PanelStateMessage` empty states, `DeviceFrame` for `flutter+react-native`, iframe for `website` (`PreviewStage.tsx:897-898` — RN now correctly inside device frame not browser chrome), `previewPanel.logic.ts` pure state machine `idle|starting|running|failed` + `PreviewPaneTab preview|tests|problems|qualityGate|release`.

**Prune / simplify (add or remove unnecessary things — approved):**
- Remove `FlutterToolchainBanner` coupling from preview header — move to a one-time `doctor` interstitial before first preview, not per-thread poll (`TOOLCHAIN_POLL_INTERVAL_MS 10s` noisy). Install progress stays but as global banner, not branch tab.
- Collapse 5 preview contract tabs into `3 + terminal`: `preview | qualityGate | release + console branch` — `tests` and `problems` fold into `qualityGate` (they already do in `QualityGatePanel.tsx:496-586`).
- Remove `BranchId record|home|rotate|shutdown` as top-level actions — `home/rotate/screenshot/shutdown` become tiny controls inside header icon cluster, not full branch cards.
- Remove `nativeFrameBusy + native screenshot polling NATIVE_FRAME_POLL 1.5s` fire-and-forget — harness provides real `screenshot` tool with handle that can be `SIGTERM`-killed (`M8` interruptibility).
- Add thin server push for `preview.getState` + `artifact_updated` so `PREVIEW_POLL_INTERVAL_MS 2s` / `BUILD_POLL_INTERVAL_MS 2s` polling can be retired after `M8`.

Schema stays `packages/contracts/src/preview.ts:1-289` (`PREVIEW_WS_METHODS start|stop|reload|getState|analyze|test|buildStart|buildState|screenshot|devices|flutterToolchain*`) — no change.

---

## 3. Slash commands — audit `/` → keep functional, delete dead weight

Current `BUILT_IN_COMPOSER_SLASH_COMMANDS:33` in `packages/shared/src/composerSlashCommands.ts:1-33` + `apps/web/src/composerSlashCommands.ts:134-336`:
`init, spawn, btw, goal, schedule, browser, grill-me, teamwork-preview, learn, doctor, test, analyze, build, preview, theme, clear, compact, model, plan, debug, default, review, fork, side, status, subagents, fast, export, feedback, automation, goals, commands, help`

For perfect milestones (`M1-M27`) only 13 survive attached to real harness mechanics. Rest are legacy Flutter/engine or never-functional filler — no dyad.

**Keep (13) — wired to real state:**
- `preview` — toggle floating stage (`§2`)
- `build` — `apk|appbundle|ipa|web` + `debug|profile|release` per `parseBuildSlashCommandArgs` (`M21`) — `M16` release artifact
- `test` / `analyze` — qualityGate (`M16`) `flutter analyze|test` etc per framework
- `plan` / `debug` / `default` — mode switch into `Plan|Evidence-first Debug|Normal` (`M4` stage context)
- `review` — comparative benchmark trigger (`M16 g`)
- `fork` / `side` — thread fork into `local|worktree` & guarded Side (`M1` branching)
- `status` — context window + rate-limit banner (`M9`)
- `clear` / `compact` — thread fresh + proactive compaction at 70% (`M9`)
- `theme` — palette switcher (design contract)

**Delete (20) — remove from `BUILT_IN_*`, menu, parser, and server handling:**
`init, spawn, btw, goal, goals, schedule, browser, grill-me, teamwork-preview, learn, doctor, model, subagents, fast, export, feedback, automation, commands, help, clear-alias-collections` — reasons: `init` = scaffold now registry-driven (`M2`); `spawn/subagents/teamwork-preview` = Router→subagent impl detail not a user slash (`M7`); `btw/grill-me/learn` = unbounded prompt filler (`L3` skills cover); `goal/schedule/automation` = goal system deleted in shell reset (`M0`); `browser` = harness tool not a slash; `doctor` = moved to pre-preview toolchain interstitial; `model` = Router cost-aware picks per role/budget (`M20`); `fast` = same; `export/feedback/commands/help` = replaced by palette/diff-staging trust (`M19` live diff).

Provider-native collision shield `shouldKeepBuiltInSlashCommandDespiteNativeCollision` and `providerUsesAppOwnedReviewSlashCommand` stays but trimmed to the kept set. `getAvailableComposerSlashCommands` branch `provider===anthropic` vs not collapses to single kept list post-prune.

---

## 4. Target architecture (short)

```
apps/desktop (window shell only)
   ↕ nativeApi bridge
apps/server (single owner) ── DyadRunner ── WS typed envelopes {token,tool_call,stage,checkpoint,artifact_updated} ──► apps/web shell
                              │  Router → Planner → Builder( fresh ctx per slice ) → Verifier( fresh ctx+render ) → Fixer → Taste → Security/Perf
                              │  L0+L1 cached prompt + L2(stage) + L3(skill) + design tokens JSON
                              │  Compaction rolling @70% artifact-over-conversation + per-slice isolation
                              │  Tool validation x2 (schema + permission) readOnly parallel vs sequential deps
                              │  Framework registry blank|react-native|flutter|website → scaffold, prompts, tools, preview, build
                              │  Fresh sqlite namespace, project-scoped preview/build/DB (no path override)
apps/web (dumb shell)
  RouteInsetSurface + SidebarFrameworkRows + ChatView{Skeleton, ComposerPill, TimelineTypedRows{Token,Tool,Stage,Verifier,Taste,Checkpoint,Artifact}, PreviewStage672px, CheckpointCard+Confidence+DiffSummary}
```

---

## 5. UI integration — Remove / Add / Change / Redesign (live `apps/web/src` 1157 files)

| Area | Remove | Add | Change | Redesign |
|---|---|---|---|---|
| Shell / chrome `RouteInsetSurface,Sidebar,ChatView` | — | `StageRail` + interruptable `SIGTERM` button (`M4/M8`), `CheckpointGate` drawer (`M13`). | Sidebar/ChatView read single typed event bus not `orchestration.*`+`EngineAdapter`. Disclosure stays single source `lib/disclosureMotion.ts` 220ms + `DisclosureRegion` + `CollapsiblePanel` + `DisclosureChevron`. | — |
| Sidebar/history `SidebarThreadRowContent,kanban,goals` | `ProviderIcon` beside threads, `ProviderUsage*`, `AutomationProposalActions`, `Kanban*` harness lists — `goalStore,collectionsStore` stripped (`M23`). | `ConfidenceDot` on Verifier+Taste, `Decisions Log` (`M20`). Framework badge immutable (`FrameworkIcon`). | Row shows `framework+checkpoint+diff count` not logo. | Hover to white pill CTA per `design.md:3` not context menu. |
| Timeline `MessagesTimeline+6 variants,Caide*Card` | `CaideThinkCard/CaideGenericToolCard` inferred running, `rowOverlap/tailAnchor/toolDetails` scroll hacks, `useSmoothStreamedText` parse. | Typed rows `Token|Tool{started|completed|failed|cancelled}|StageTransition|Verifier+confidence+Taste|CheckpointRequireResponse|ArtifactDiffSummary` (`M8/M19`). One-way TailAnchor counting real messages only. | Consume separate `token` vs `event` streams not multiplexed text. | `ChatEmptyStateHero` → `design.md:30` `illustration grayscale→bold→muted→single white pill CTA` +2 variants. Skeletons over spinners. |
| Composer `Composer*:20` | `ComposerModelEffortPicker`, `ComposerSubagentStrip/EngineSubagentStrip`, `ComposerCommandMenu` legacy, `composerDraftStore:5`+`pendingInteractionDerivation`. | `RouterIntentBar`+`PermissionTierPill`+`SkillChips L3`+`CostBudgetMeter`(`M20`)+`Interrupt`. | `CreateAppDialog` → `FrameworkCard:4` immutable. Composer → harness questions via `planning_questionnaire` tool. | Pill/floating contextual placeholder depth, one primary per screen. |
| Preview/Device `BrowserPanel,DevicePanel,DiffPanel,PreviewStage` §2 | `FlutterToolchainBanner` in header, `preview_host.ts` port-retry hack, `useDeviceVideoStream` feedback loop. | `VisualVerifierPane` screenshot+Taste overlay per slice (`M11`). | Preview resolves workspace server-side; `DiffPanel` shows `live diff staging` plain terms. | Device frame near-black `~#0D0D0D` + white pill controls per `design.md:2-3`. |
| Approvals `ComposerPending* ,Caide*Approval` | Old `planning_questionnaire max-3 retry` + ad-hoc `plan_mode_prompt` cards. | `CheckpointCard{Verifier+Fixer+Taste+confidence+Approve/Request change/View diff}` async non-blocking tier (`M19`)+`DecisionLogPanel`. | Settlement keyed `project,thread,chat,turn`+`requestId` collision guard (`M13`). | Cards `CaideCardPrimitives` white pill `Approve` not accent red. |
| Settings `settings/*:15` | `ModelsSettingsPanel` per-model, `ExternalMcpSettingsPanel`, `SkillsSettingsPanel` free-form, `ConversationStorage*` migrations. | Minimal `Framework display + Provider API key + Theme dark-first near-black + Home dir` + read-only skill catalog (`M6`). | `SettingsSidebarNav` 8→4 sections. | Palette single accent restrained (`ThemeModePicker`). |
| Streaming/a11y | `ContextWindowMeter` naive, `RateLimitsPanel` generic `Internal server error`. | `ContextCompactionBanner @70%` clean boundary (`M9`), `ProviderErrorCard` actionable retry. | Scroll-follow counts real messages only, small transcripts no virtualization (`timelineHeight.ts` guard). | Inline validation + undo > confirm. |

---

## 6. Public contracts

- Add `ProjectFramework = "blank"|"react-native"|"flutter"|"website"` immutable on app, `preserveApiKeysByFramework` in registry.
- `NativeApi.preview.*` stays; slash command list trimmed to 13 above — web `filterComposerSlashCommands` and shared `BUILT_IN_COMPOSER_SLASH_COMMANDS` both updated.
- `WS_GITHUB_PROJECT_PROVISIONING_CAPABILITY` unchanged.
- All other `packages/contracts` harness contracts (`orchestration,providerRuntime,automation,subagents,*Automation*`) removed — only `baseSchemas,projectFramework,preview,git,*Server*` skeleton survives.

---

## 7. Import rules

1. Copy coherent subsystems (tests included) not isolated files.
2. New runtime is pure Caide harness — no dyad lifecycle/DB reuse, state starts clean — no broad compat shims.
3. Replace Electron IPC edges with tiny in-process host `{invoke,notify,cancel,settings/secrets,paths}`.
4. No `Effect ⋈ Promise` mixing inside harness — boundary conversion at WS edge only.
5. There is no dyad source checkout — this is green-field Caide harness.
6. Do not delete old runtime until replacement passes `§10 Acceptance`.
7. Slash list is single source of truth in `packages/shared/composerSlashCommands.ts` — web must not hardcode a parallel list.

---

## 8. Detailed work checklist — Perfect (`M0-M27` from prior synthesis)

### M0 Shell reset
- [x] `c4a3e7da` snapshot on `feature/backend-transplant`, branch `feature/shell-rebuild` pushed to `origin`+`caide-final` (2026-08-28)
- [ ] Delete `~2950` files per `§1` — tree left with §1 shell only, commit `chore: shell reset`
- [ ] Regenerate `apps/engine/dist*` from scratch (no checked-in bundles)

### M1 Scope contract
- [ ] `spec.md` gate: who, 3-5 core flows, platform, explicit v1 out-of-scope — `spec.md`+`architecture.md`+`manifest.json` are source of truth

### M2 Architecture
- [ ] Framework registry `blank|react-native|flutter|website` immutable + detection + validation
- [ ] Evidence-based arch after 1-2 ugly screens confirm pattern (fixes waterfall critique)

### M3 Design tokens
- [ ] `design.md` → `colorTokens/background #0D0D0D accent #E8493C typeScale headline24/bold componentRules emptyState/primaryButton iconPack phosphor-duotone spacingUnit4` JSON injection
- [ ] Component library `buttons,inputs,cards,bottomNav(icon+label+FAB device frame),empty 2 variants,search pill, top brand+badge` (§3 of `design.md`)

### M4 State machine
- [ ] Single `caideRunner` with `created→running→waiting→terminal{completed,failed,cancelled,aborted}` exactly one settlement; reconcile stale once

### M5 Prompts
- [ ] `L0+L1` cached, `L2(stage)+L3(skill)` dynamic; describe `L3` retrieval + `web3/skill packs` under registry

### M6 Tools
- [ ] 86 Caide tools (inspired by dyad×caide set, now rebuilt as Caide-native) + `planning_questionnaire` + `explore_code_subagent` with metadata `readOnly` + `failure modes` in description; double validation; pre-digested results

### M7 Roles
- [ ] `Router(cheap/fast) → Planner → Builder(per-slice fresh ctx) → Verifier(fresh ctx+render never sees builder trace) → Fixer(targeted) → distinct harness voice`

### M8 Streaming
- [ ] Separate `token(SSE)` vs `event(WS typed envelopes {token,tool_call{started|completed|failed},stage,checkpoint,artifact_updated})` + `SIGTERM` kill mid-tool

### M9 Compaction
- [ ] Rolling summary not truncation `@70%` clean boundary + `artifact-over-conversation` + per-slice fresh ctx + ephemeral vs persisted decision left explicit

### M10 Slice loop
- [ ] One complete flow UI+state+data+edge per slice; retire horizontal anti-pattern

### M11 Visual verification
- [ ] Habit after every screen: live preview → screenshot → Verifier; poll fallback → push; slash `preview` is entry (§2)

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
- [ ] `Taste` separate cheap aesthetic vs `design.md`; confidence score per Verifier low-queues human glance; `Live diff staging` plain terms not raw diff before commit

### M20 Cost/retrieval
- [ ] `L0+L1` prompt caching, semantic skill cache (`login→signup`), speculative 2-draft parallels for ambiguous slices, project decisions log `why`, cost-aware routing by budget

### M21 Preview/build routing (`§2` keep)
- [ ] `Blank→unavailable explicit, RN Website → browser dev-server, RN+Flutter → device frame+(prebuild→Gradle assemble/bundle / flutter pub→APK/AAB/IPA), Website → Vite+build dist.tar.gz` — trusted workspace enforced

### M22 Polish
- [ ] Micro-interactions/transitions/haptics + a11y `contrast,tap, screen reader` after core flows solid

### M23 Self-improving loop
- [ ] Track skill combo → Verifier confidence vs Fixer retries → refine skills; across-project edge failures → stronger defaults

### M24 Evaluation
- [ ] A/B harness for any `skill/role/prompt/phase` change vs benchmark

### M25 Global concerns
- [ ] RTL/localization text expansion + mirror, team permissions + audit trails, license compatibility legal review

### M26 Acceptance
- [ ] Clean boot no migration repair, create `Blank/RN/Flutter/Website` persist icons, `hey` flows in `ask→plan→agent/build`, ordered token+tool stream, approvals/questions resume same turn, cancellation no stale running, provider failures visible with retry, 2 projects×N chats concurrent+restart with zero cross-talk, long-chat compaction+continue, preview+build per framework green, on-disk `design.md:PreviewStage` demo, `bun fmt/lint/typecheck` pass

### M27 V1 cut (if ship before perfect)
- [ ] `RN-only + Provider abstraction+state machine + Plan→Build Tier1 + Builder→Verifier only (no Fixer/Taste/Edge/Adversarial) + screenshot preview only + no deploy` — per `claudediscussion.md:129-136`

---

## 9. Handoff

Next commit: `docs: add 002-shell-rebuild plan` on `feature/shell-rebuild`. After that: execute `M0` shell reset delete + slash prune + `PreviewStage` prune in one commit, then iterate `M1-M5` harness skeleton per checklist.
