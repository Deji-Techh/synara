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

## 10. Post-M27 milestones — user-POV audit (added 2026-08-29)

Every item below was audited from a user's POV: what they see, click, type, wait for, and expect. Auth is excluded per user directive.

### M28 Delete dead web code (Sidebar, hooks, stores, lib)
- [ ] **Sidebar.tsx strip:** Delete all harness logic (`SidebarRowHoverActions`, `SidebarSearchPalette`, `SidebarActivityView`, `SidebarMetaChip`, `SidebarHoverCardContent`, `ProjectHoverCardContent`, `ThreadHoverCardContent`, `ThreadArchiveActionButton`, `ThreadPinToggleButton`, `SidebarSectionToolbar`). Keep only `SidebarProvider + SidebarContent + SidebarGroup + SidebarMenu + SidebarMenuItem + FrameworkIcon + DisclosureChevron + SidebarSurfacePicker`.
- [ ] **Delete 50+ hooks:** `useChatComposer`, `useChatTerminalTabs`, `useChatThreadActions`, `useChatTurnLifecycle`, `useComposerCommandMenuItems`, `useComposerDropzone`, `useComposerImageIntake`, `useHandleNewChat`, `useHandleNewThread`, `useThreadHandoff`, `useThreadRecap`, `useThreadUnblock`, `useTurnDiffSummaries`, `useProviderModelCatalog`, `useProviderUsageSummary`, `useSidebarProjectRunController`, `useSidebarThreadActions`, `useComposerSlashCommands`, `useBrowserPanelDesktopBridge`, `useDockPaneRuntimeActivation`, `useDeviceEventBridge`, `useDeviceSupport`, `useEditorLaunchers`, `useGlobalCommandPalette`.
- [ ] **Delete 5 stores:** `store.ts`, `storeSelectors.ts`, `threadSelectionStore`, `terminalStateStore`, `workspacePathsStore`, `rightDockStore`, `splitViewStore`, `spacesUiStore`, `pinnedProjectsStore`, `composerDraftStore` + `composerDraftActions/Attachments/Domain/Models/Persistence`, `browserStateStore`, `deviceStateStore`, `projectRunStore`, `goalStore`, `engineSubagentStore`, `collectionsStore`, `artifactsGrid.logic`.
- [ ] **Delete lib harness half:** `activeThreadDelete`, `archivedThreadDelete`, `appDensity`, `appNaming`, `assistantSelections`, `automationDraft/Form/Intent/Status`, `browserAnnotations`, `caideApps`, `chatFirstSend`, `chatMode`, `chatPaneScope`, `chatProjects`, `chatReferences`, `chatWorkspaceFolders`, `codeFence`, `composerAttachmentCapacity`, `composerImageBlobStore`, `dockPaneActivation`, `fileComments`, `gitReactQuery`, `kanbanDispatch`, `linkChips`, `localFolderMentions`, `modelFavorites`, `pinnedMessages`, `pinning.logic`, `projectPaths`, `pullRequestReactQuery/providerDiscovery`, `providerModelPrefetch`, `pullRequestList`, `runtimeMode`, `serverReactQuery`, `staticSnapshot`, `subagentPresentation`, `threadDetailEvents`, `threadEnvironment`, `threadExport`, `threadHierarchy`, `threadMarkers`, `threadMentions`, `threadSummary`, `threadWorkspace`, `toolOutputSummary`, `worktreeHandoff`. Keep only `utils`, `relativeTime`, `fontFamily`, `icons`, `central-icons`, `disclosureMotion`.
- [ ] **Delete 15 settings panels:** `AdvancedSettingsPanel`, `ProvidersSettingsPanel`, `ModelsSettingsPanel`, `SkillsSettingsPanel`, `ExternalMcpSettingsPanel`, `ConversationStorageSettingsPanels`, `KeyboardShortcutsSettingsPanel`, `DesktopSettingsPanels`, `ProfileSettingsPanel`, `skillsSettingsModel`, `SettingControls`, `SettingsPanelPrimitives`, `AppIconPicker`, `PaletteSwatchPicker`, `settingsNavigation.ts`.
- [ ] **Delete dead components:** `CreateAppDialog`, `CreateGitHubProjectFields`, `DebugFeatureFlagsMenu`, `FeedbackDialog`, `ShortcutsDialog`, `DoctorDialog`, `WhatsNewDialog`, `ReleaseHistoryDialog`, `ProjectsHistoryDialog`, `ArtifactsDialog`, `PullRequestThreadDialog`, `GitCreatePrDialog`, `GitActionsControl`, `BranchToolbar`, `SpaceEditorDialog`, `SpaceProjectPickerDialog`, `SpaceSwitcher`, `SpaceIcon`, `SpaceEmptyState`, `RenameDialog`, `RenameThreadDialog`, `PluginLibrary`, `ProjectScriptsControl`, `EditorWorkspaceView`, `OnboardingTour`, `AntigravityIcon`, `FolderClosed`.

### M29 Delete dead server code (remaining stubs)
- [ ] **Delete server ts-nocheck stubs:** `index.ts` (Effect entry point importing deleted modules), `main.ts` (CLI config importing deleted `persistence/sqlite`, `orchestration`, `provider`), `serverSettings.ts` (imports deleted contracts), `providerCredentials.ts` (imports deleted `auth/Layers/ServerSecretStore`), `workspace/Layers/WorkspaceFileSystem.ts` + test, `project/githubProjectProvisioning.ts` + `project/Services/ProjectFaviconResolver`.
- [ ] **Delete apps/engine entirely** (except `scaffold/src/caide-ui/tokens.css`): `pro/`, `ipc/`, `lib/`, `db/`, `prompts/`, `types/`, `constants/`, `shared/`, `worker/`, `scaffold-flutter/`, `fixtures/`, `raw-assets/`, `scripts/`, `dist/`, `dist-single/`, `drizzle/`, `drizzle/meta/` — all dead harness. Keep `scaffold/src/caide-ui/tokens.css` as the design token CSS reference.

### M30 Delete dead contracts (prune to pure Caide)
- [ ] **Delete 13 contracts ts-nocheck files:** `agentMentions.ts` (imports deleted `./orchestration`), `caideApps.ts`, `externalMcp.ts`, `git.ts`, `githubProjectProvisioning.ts`, `ipc.ts` (imports deleted `./automation,device,terminal`), `model.ts`, `rpc.ts`, `server.ts`, `settings.ts`, `stats.ts`, `ws.ts`. Keep only `baseSchemas`, `auth`, `browserAnnotations`, `preview`, `projectFramework`, `project`, `editor`, `environment`, `filesystem`, `database`, `keybindings`.

### M31 Delete dead shared code
- [ ] **Delete dead shared files:** `providerUsage.ts`, `serverSettings.ts`, `threadDetailEvents.ts`, `threadEnvironment.ts` (all `ts-nocheck`), `providerMetadata.ts`, `subagents.ts`, `terminalThreads.ts`, `pendingInteractions.ts`, `git.ts` (harness), `migrationRecovery.ts`, `chatThreads.ts`, `codexConfig.ts`, `cli.ts`, `browserSession.ts`, `automationMode.ts`, `conversationEdit.ts`, `desktopChrome.ts`, `model.ts` (harness), `runtimeMode.ts`, `errorMessages.ts`, `DrainableWorker.ts`, `Net.ts`, `pinnedMessages.ts`, `projectContainers.ts`, `projectDirectoryName.ts`, `providerDeliveryBlock.ts`, `staticSnapshot.ts`, `Struct.ts`, `unifiedPatchStats.ts`, `windowsCertificate.ts`, `windowsProcess.ts`. Keep only `formatBytes`, `path`, `text`, `logging`.

### M32 Rebuild real server HTTP + WS (replace ts-nocheck god file)
- [ ] **Create minimal `apps/server/src/http.ts`** (pure Node.js or minimal Effect): mount `POST /api/harness/stream` (SSE `typed {token}`) + `POST /api/harness/verify` (JSON `handleVerifySlice`) + `GET /health`. No deleted `persistence/Layers/Sqlite`, no `auth/effectHttp`, no `ProviderAdapterRegistry`.
- [ ] **Delete `apps/server/src/wsRpc.ts` stub** (`Layer.empty` + `RpcGroup.make`) — no longer needed with `http.ts` routes.
- [ ] **Wire `apps/server/src/index.ts`** to start Node HTTP server (or Bun.serve) + mount `harnessEffectRouteLayer`. No Effect layers needed — plain `fetch` handler.

### M33 Rebuild real ChatView with real streaming
- [ ] **Delete `setInterval` fallback** in `ChatView.tsx:74-89` — require real `/api/harness/stream` SSE.
- [ ] **Wire `ChatView` send to POST `/api/harness/stream`** with real `{threadId, turnId, prompt, model, baseUrl, apiKey}` — no hardcoded `apiKey: ""`.
- [ ] **Render streaming tokens** from SSE as they arrive (not waiting for `[DONE]`).
- [ ] **Render `tool_call`/`stage`/`checkpoint` typed events** as separate typed rows with icons.
- [ ] **Replace `placeholder="Describe a slice"`** with real contextual placeholder from `design.md:7` ("Cheap 2 bedroom flat in Lusaka" pattern — show different placeholder based on project framework).

### M34 Rebuild real MessagesTimeline
- [ ] **Rebuild `apps/web/src/components/chat/MessagesTimeline.tsx`** to render typed `LiveEvent[]` from `ChatView`: `token` (streaming caret), `tool_call` (icon + name + status dot), `stage` (from→to transition), `checkpoint` (`CheckpointCard` with confidence + taste + diff).
- [ ] **One-way TailAnchor** — scroll to bottom on new message but never fight with user scroll-up.
- [ ] **Token stream renders streaming caret** (`streaming-caret` from `index.css`) at current position.
- [ ] **Tool calls show name + status** (amber pulse for `started`, green for `completed`, red for `failed`).

### M35 Rebuild real CheckpointCard (live, not stub)
- [ ] **Replace `diffSummary="preview: 1 file"`** with real `git diff --stat` plain-terms via cheap summarization call.
- [ ] **Replace `alert()` on "View diff"** with actual diff panel (inline `FileDiffView` or modal).
- [ ] **Replace `prompt()` on "Request change"** with proper `<textarea>` input.
- [ ] **Wire `onApprove` to POST to server** (not just local state update).

### M36 Rebuild real CreateAppDialog (framework picker)
- [ ] **Rebuild `apps/web/src/components/CreateAppDialog.tsx`** with 4 framework cards: `Blank` (empty), `React Native` (Expo), `Flutter`, `Website` (Vite).
- [ ] **Each card shows:** framework icon, name, description, one-line preview ("Scaffolds an empty project", "Expo app with TypeScript", "Dart app with Material Design", "Vite + React/TS/Vanilla").
- [ ] **Click creates project** → `POST /api/harness/project` → server calls `scaffoldProject()` with `framework`, `workspaceRoot`, `name` → returns `projectId + threadId`.
- [ ] **Sidebar updates** with new project + first thread immediately.

### M37 Rebuild real Settings page
- [ ] **Create `apps/web/src/components/SettingsPage.tsx`** — minimal, 4 sections:
  1. **Theme:** `ThemeModePicker` (light/dark/system) + accent color picker + contrast slider — reuse existing `theme.logic.ts` tokens.
  2. **Provider:** API key input for OpenCode Zen + OpenCode Go (masked, never displayed back) + model list refresh.
  3. **Framework display:** Show current framework (immutable after creation).
  4. **Home directory:** `~/caide-apps` path display.
- [ ] **No auth section** (per user directive).
- [ ] **No MCP, no skills, no advanced settings** — too complex for v1.

### M38 Wire real project list + thread list to Sidebar
- [ ] **Sidebar shows projects** from `frameworkStore` + `~/caide-apps/` filesystem scan.
- [ ] **Each project shows `FrameworkIcon` + name + thread count.**
- [ ] **Click project → show threads** underneath as collapsible list.
- [ ] **Click thread → navigate to `ChatView`.**
- [ ] **Sidebar search** — simple text filter over project/thread names.

### M39 Rebuild real Project creation flow
- [ ] **`CreateAppDialog` (M36) wired to `POST /api/harness/project`** server route.
- [ ] **Server creates:** `~/caide-apps/<slug>/` directory + `README.md`/`package.json`/`pubspec.yaml` + `.caide/framework.json` + returns `{projectId, threadId, framework, workspaceRoot}`.
- [ ] **Sidebar updates** with new project + first thread.
- [ ] **No workspace root picker** — server uses `~/caide-apps/<slug>` canonical.

### M40 Rebuild real Thread creation flow
- [ ] **"+ New thread" button in Sidebar** (below project).
- [ ] **Creates thread** → `POST /api/harness/thread` → server creates turn state via `caideRunner` → returns `{threadId, turnId}`.
- [ ] **Navigates to `ChatView`** with new `threadId`.

### M41 Rebuild real KeyboardShortcuts + CommandPalette
- [ ] **`⌘K` / `Ctrl+K` command palette** — open dialog showing available slash commands + actions.
- [ ] **`⌘N` new thread**, `⌘P` new project, `⌘,` settings.
- [ ] **`⌘Enter` send message.**
- [ ] **`Shift+Enter` new line in composer.**
- [ ] **`Escape` close dialogs.**
- [ ] **Rebuild `ShortcutsDialog`** showing all keybindings.

### M42 Rebuild real EmptyStates
- [ ] **No projects:** "Create your first project" with `FrameworkCard` picker inline.
- [ ] **Project with no threads:** "Start a conversation" with + button.
- [ ] **Thread with no messages:** "Describe what you want to build" with contextual placeholder.
- [ ] **No preview running:** "Start preview" button in `PreviewStage`.
- [ ] **Loading:** skeleton `Skeleton` components (already in `ui/skeleton.tsx`) for sidebar + timeline + composer.

### M43 Rebuild real ErrorStates
- [ ] **Provider connection lost:** banner with retry button.
- [ ] **Build failed:** error card with expandable log + retry.
- [ ] **Preview crashed:** "Preview failed to start" with diagnostic + retry.
- [ ] **Network error:** "No connection" with reconnect attempt.
- [ ] **Rate limit:** rate limit banner with cooldown countdown.

### M44 Rebuild real FileDiffView
- [ ] **`DiffPanel.tsx`** — show file changes after a build (what files were created/modified).
- [ ] **`FileDiffView`** — inline diff with added/removed lines highlighted.
- [ ] **Plain-terms summary** ("Added login screen with empty state, modified Home screen to include search bar") not raw diff syntax.

### M45 Rebuild real Responsive/Mobile
- [ ] **Mobile bottom navigation** (per `design.md:27`): icon+label for Chats/Projects/Settings.
- [ ] **FAB (floating action button)** for new project creation — offset outside tab row per `design.md`.
- [ ] **Sidebar collapses to bottom nav on mobile** (`useIsMobile` already exists).
- [ ] **Composer shrinks to full-width on mobile** (no side-by-side with preview).

### M46 Rebuild real Onboarding
- [ ] **First-run tour:** 3-4 step tour showing: (1) Create a project, (2) Type what you want to build, (3) Watch it generate, (4) Preview the result.
- [ ] **"Skip tour" option.**
- [ ] **Store `seen` flag in localStorage.**

### M47 Rebuild real ErrorBoundary
- [ ] **`<ErrorBoundary>` wrapping the app** — shows fallback UI on React errors.
- [ ] **Logs error to console** with context (which component, which action).
- [ ] **"Reload app" button.**

### M48 Rebuild real LoadingStates
- [ ] **Initial app load:** `Skeleton` sidebar + `Skeleton` timeline + `Skeleton` composer.
- [ ] **Thread switching:** skeleton timeline.
- [ ] **Project creation:** loading spinner in dialog.
- [ ] **Preview starting:** "Starting preview…" skeleton.

### M49 Rebuild real Accessibility
- [ ] **ARIA labels** on all interactive elements (`<input>` label, `<button>` aria-label).
- [ ] **Focus management** — after sending a message, move focus to timeline bottom.
- [ ] **`aria-live="polite"`** on streaming text region for screen readers.
- [ ] **Skip-to-content link** for keyboard users.
- [ ] **All color contrast ≥4.5:1** (theme tokens already handle this via `design.md`).

### M50 Rebuild real Performance
- [ ] **`React.lazy`** for heavy components (`PreviewStage`, `SettingsPage`, `ShortcutsDialog`, `CommandPalette`).
- [ ] **Virtualized list** for long timelines (when thread >100 messages).
- [ ] **Image optimization** for preview screenshots (WebP, lazy loading).
- [ ] **Code splitting** between routes.
- [ ] **`useMemo`/`useCallback`** for expensive computations in `ChatView`.

### M51 Rebuild real Notification System
- [ ] **`toast` notifications** for: build started, build completed, build failed, preview started, preview crashed, rate limit hit, provider error.
- [ ] **`toastManager`** already exists in `ui/toast.tsx` — wire to server events.
- [ ] **Auto-dismiss** after 5s for success, manual dismiss for errors.

### M52 Complete M28-M51 as integrated bundle
- [ ] **All of M28-M51 must be implemented together** — cannot ship ChatView without timeline, cannot ship sidebar without project list, cannot ship settings without theme picker.
- [ ] **Commit `chore: M28-M52 — complete web shell rebuild`** after all are wired.
- [ ] **Run `bun typecheck` + `bun lint`** green.

### M53 Wire real provider streaming end-to-end
- [ ] **`ChatView` → `POST /api/harness/stream`** → `streamEndpoint.ts` → `caideRunner.streamProvider` → `endpointForModel` per Go docs (`grok/gpt/muse→/responses`, `minimax/qwen/claude→/messages`, `gemini→/models/<id>`, fallback `chat/completions`) → SSE `typed {token}`.
- [ ] **User types "hey" → real OpenCode `https://opencode.ai/zen/v1` stream → tokens appear in timeline.**
- [ ] **No local echo fallback** — error shows real provider error with retry.

### M54 Wire real PreviewStage verification
- [ ] **`PreviewStage` screenshot → `POST /api/harness/verify`** → `handleVerifySlice` → `caideRunner.runSlice` → `verifySlice` fresh ctx → `CheckpointCard` with real `confidence` + `tasteScore` + `diffSummary`.
- [ ] **No `void image`** — real typed `artifact_updated` event via `harness/wsCaide`.
- [ ] **`getState` push** (not poll `2s`) after `M8` streaming is plumbed.

### M55 Wire real Framework persistence
- [ ] **`frameworkStore.setFrameworkAsync`** → write to `~/caide-apps/<slug>/.caide/framework.json` + `Sqlite apps.framework` column (when DB layer is wired).
- [ ] **`getFrameworkFromFile`** reads on restart.
- [ ] **Sidebar `FrameworkIcon`** shows persisted framework for every project/thread.

### M56 Wire real Project/Thread CRUD
- [ ] **`POST /api/harness/project`** → `scaffoldProject()` → `~/caide-apps/<slug>/` + `.caide/framework.json` → `{projectId, threadId, framework}`.
- [ ] **`POST /api/harness/thread`** → `caideRunner.createTurn()` → `{threadId, turnId}`.
- [ ] **`GET /api/harness/projects`** → scan `~/caide-apps/` + read `framework.json` → `[{id, name, framework, threadCount}]`.
- [ ] **`GET /api/harness/projects/:id/threads`** → list turn states → `[{threadId, title, status, createdAt}]`.

### M57 Wire real Sidebar → Project/Thread list
- [ ] **Sidebar fetches `GET /api/harness/projects`** on mount.
- [ ] **Each project row:** `FrameworkIcon + name + thread count` + chevron to expand.
- [ ] **Expand → `GET /api/harness/projects/:id/threads`** → list threads with status dots.
- [ ] **"+ New project"** → opens `CreateAppDialog`.
- [ ] **"+ New thread"** → `POST /api/harness/thread` → navigate to `ChatView`.

### M58 Wire real CreateAppDialog → server scaffold
- [ ] **4 `FrameworkCard` components:** `Blank`, `React Native`, `Flutter`, `Website` — each with icon, name, one-line description.
- [ ] **Input field** for project name (contextual placeholder per framework).
- [ ] **"Create" button** → `POST /api/harness/project` → server creates `~/caide-apps/<slug>/` + framework files → returns `{projectId, threadId}` → navigate to `ChatView`.
- [ ] **No workspace root picker** — server canonical.

### M59 Wire real Settings page
- [ ] **Theme:** `ThemeModePicker` + accent color + contrast — reuse `theme.logic.ts` tokens, no hardcoded hex.
- [ ] **Provider:** API key input (masked) for OpenCode Zen/Go + model list refresh button.
- [ ] **Framework:** display current framework (immutable).
- [ ] **Home dir:** display `~/caide-apps` path.
- [ ] **No auth, no MCP, no skills, no advanced** — too complex for v1.

### M60 Wire real Sidebar → server project list
- [ ] **Sidebar mounts `GET /api/harness/projects`** on init.
- [ ] **Projects sorted by `updatedAt`** (newest first).
- [ ] **Thread list per project** shows status dots (running=amber pulse, completed=green, failed=red).
- [ ] **FrameworkIcon** per project + thread.
- [ ] **Search** filters project/thread names.

### M61 Wire real Project creation → server scaffold
- [ ] **`CreateAppDialog` → `POST /api/harness/project`** → server calls `scaffoldProject()` from `harness/scaffold.ts` → `~/caide-apps/<slug>/` + `.caide/framework.json` → returns `{projectId, threadId, framework, workspaceRoot}`.
- [ ] **Sidebar updates** with new project + first thread immediately.

### M62 Wire real Thread creation
- [ ] **"+ New thread" button** in Sidebar under each project.
- [ ] **`POST /api/harness/thread`** → `caideRunner.createTurn()` → `{threadId, turnId}`.
- [ ] **Navigate to `ChatView`** with new `threadId`.

### M63 Wire real KeyboardShortcuts + CommandPalette
- [ ] **`⌘K` / `Ctrl+K`** → open `CommandPalette` dialog (rebuild from deleted `useGlobalCommandPalette`).
- [ ] **Shows all 14 slash commands** + `New project`, `New thread`, `Settings`, `Toggle preview`.
- [ ] **`⌘,`** → settings, `⌘P` → new project, `⌘N` → new thread.
- [ ] **`⌘Enter`** send, `Shift+Enter` new line.
- [ ] **`Escape`** close dialogs.
- [ ] **Rebuild `ShortcutsDialog`** with all keybindings.

### M64 Wire real EmptyStates
- [ ] **No projects:** "Create your first project" + inline `FrameworkCard` picker.
- [ ] **Project, no threads:** "Start a conversation" + new thread button.
- [ ] **Thread, no messages:** contextual placeholder per framework.
- [ ] **Preview not running:** "Start preview" in `PreviewStage`.
- [ ] **Loading:** `Skeleton` sidebar + timeline + composer on initial mount.

### M65 Wire real ErrorStates
- [ ] **Provider connection lost:** banner with retry.
- [ ] **Build failed:** error card + expandable log + retry.
- [ ] **Preview crashed:** "Preview failed" + diagnostic + retry.
- [ ] **Network error:** "No connection" + reconnect.
- [ ] **Rate limit:** banner with cooldown.

### M66 Wire real FileDiffView
- [ ] **`DiffPanel.tsx`** — file changes after build (created/modified files).
- [ ] **`FileDiffView`** — inline diff with +/- lines highlighted.
- [ ] **Plain-terms summary** ("Added login screen with empty state") not raw diff.

### M67 Wire real Responsive/Mobile
- [ ] **Mobile bottom nav:** icon+label Chats/Projects/Settings (per `design.md:27`).
- [ ] **FAB** for new project creation — offset outside tab row.
- [ ] **Sidebar collapses to bottom nav** on mobile.
- [ ] **Composer full-width on mobile** (no side-by-side with preview).

### M68 Wire real Onboarding
- [ ] **First-run tour:** (1) Create project, (2) Type what to build, (3) Watch it generate, (4) Preview result.
- [ ] **"Skip" button.**
- [ ] **`localStorage` `seen` flag.**

### M69 Wire real ErrorBoundary + LoadingStates
- [ ] **`<ErrorBoundary>`** wrapping app — fallback UI + "Reload" button.
- [ ] **Initial load:** `Skeleton` sidebar + timeline + composer.
- [ ] **Thread switching:** skeleton timeline.
- [ ] **Project creation:** spinner in dialog.
- [ ] **Preview starting:** "Starting preview…" skeleton.

### M70 Wire real Accessibility
- [ ] **`aria-label`** on all interactive elements.
- [ ] **Focus management** — after send, move to timeline bottom.
- [ ] **`aria-live="polite"`** on streaming text.
- [ ] **Skip-to-content** link.
- [ ] **Contrast ≥4.5:1** via theme tokens.

### M71 Wire real Performance
- [ ] **`React.lazy`** for `PreviewStage`, `SettingsPage`, `CommandPalette`.
- [ ] **Virtualized timeline** for >100 messages.
- [ ] **Image optimization** (WebP, lazy).
- [ ] **Code splitting** between routes.
- [ ] **`useMemo`/`useCallback`** in `ChatView`.

### M72 Wire real Notifications
- [ ] **Toast** for: build start/complete/fail, preview start/crash, rate limit, provider error.
- [ ] **Wire `toastManager`** (already in `ui/toast.tsx`) to server events.
- [ ] **Auto-dismiss 5s** success, manual errors.

### M73 Wire real provider streaming end-to-end
- [ ] **`ChatView` → `POST /api/harness/stream`** → `streamEndpoint.ts` → `caideRunner.streamProvider` → `endpointForModel` (per Go docs: `grok/gpt/muse→/responses`, `minimax/qwen/claude→/messages`, `gemini→/models/<id>`, fallback `chat/completions`) → SSE `typed {token}`.
- [ ] **Real OpenCode `https://opencode.ai/zen/v1` stream → tokens in timeline.**
- [ ] **No local echo fallback** — error shows real provider error + retry.

### M74 Wire real PreviewStage verification
- [ ] **`PreviewStage` screenshot → `POST /api/harness/verify`** → `handleVerifySlice` → `caideRunner.runSlice` → `verifySlice` fresh ctx → `CheckpointCard` with real `confidence + tasteScore + diffSummary`.
- [ ] **No `void image`** — typed `artifact_updated` via `harness/wsCaide`.
- [ ] **`getState` push** (not poll `2s`) after streaming plumbed.

### M75 Wire real Framework persistence
- [ ] **`frameworkStore.setFrameworkAsync`** → write `~/caide-apps/<slug>/.caide/framework.json` + `Sqlite apps.framework` column.
- [ ] **`getFrameworkFromFile`** reads on restart.
- [ ] **Sidebar `FrameworkIcon`** persists per project/thread.

### M76 Wire real Project/Thread CRUD
- [ ] **`POST /api/harness/project`** → `scaffoldProject()` → `~/caide-apps/<slug>/` + `.caide/framework.json` → `{projectId, threadId}`.
- [ ] **`POST /api/harness/thread`** → `caideRunner.createTurn()` → `{threadId, turnId}`.
- [ ] **`GET /api/harness/projects`** → scan `~/caide-apps/` + `framework.json` → `[{id, name, framework, threadCount}]`.
- [ ] **`GET /api/harness/projects/:id/threads`** → list turns → `[{threadId, title, status, createdAt}]`.

### M77 Wire real Sidebar → Project/Thread list
- [ ] **Sidebar fetches `GET /api/harness/projects`** on init.
- [ ] **Projects sorted by `updatedAt` newest first.**
- [ ] **`FrameworkIcon + name + threadCount`** + chevron expand.
- [ ] **Expand → `GET /api/harness/projects/:id/threads`** → status dots (running=amber, completed=green, failed=red).
- [ ] **"+ New project"** → `CreateAppDialog`.
- [ ] **"+ New thread"** → `POST /api/harness/thread` → navigate.

### M78 Wire real CreateAppDialog → server scaffold
- [ ] **4 `FrameworkCard` components:** `Blank`, `React Native`, `Flutter`, `Website` — icon + name + one-line description.
- [ ] **Input field** for project name.
- [ ] **"Create"** → `POST /api/harness/project` → `scaffoldProject()` → `~/caide-apps/<slug>/` + `.caide/framework.json` → `{projectId, threadId}` → navigate.
- [ ] **No workspace root picker** — server canonical.

### M79 Wire real Settings page
- [ ] **Theme:** `ThemeModePicker` + accent color + contrast (reuse `theme.logic.ts`).
- [ ] **Provider:** API key input (masked) for OpenCode Zen/Go + model list refresh.
- [ ] **Framework:** display current framework (immutable).
- [ ] **Home dir:** display `~/caide-apps` path.
- [ ] **No auth, no MCP, no skills, no advanced.**

### M80 Wire real Sidebar → server project list
- [ ] **Fetch `GET /api/harness/projects`** on init.
- [ ] **Projects sorted `updatedAt` newest first.**
- [ ] **Thread list:** status dots (amber/green/red).
- [ ] **FrameworkIcon** per project + thread.
- [ ] **Search** filters names.

### M81 Wire real Project creation → server scaffold
- [ ] **`CreateAppDialog` → `POST /api/harness/project`** → `scaffoldProject()` → `~/caide-apps/<slug>/` + `.caide/framework.json` → `{projectId, threadId}`.
- [ ] **Sidebar updates** immediately.

### M82 Wire real Thread creation
- [ ] **"+ New thread"** in Sidebar per project.
- [ ] **`POST /api/harness/thread`** → `caideRunner.createTurn()` → `{threadId, turnId}` → navigate.

### M83 Wire real KeyboardShortcuts + CommandPalette
- [ ] **`⌘K` → `CommandPalette`** (14 slash commands + actions).
- [ ] **`⌘,` → settings, `⌘P` → new project, `⌘N` → new thread.**
- [ ] **`⌘Enter` send, `Shift+Enter` new line.**
- [ ] **`Escape` close.**
- [ ] **`ShortcutsDialog`** with all bindings.

### M84 Wire real EmptyStates
- [ ] **No projects:** "Create your first project" + inline `FrameworkCard`.
- [ ] **Project no threads:** "Start a conversation" + new thread button.
- [ ] **Thread no messages:** contextual placeholder.
- [ ] **Preview not running:** "Start preview" button.
- [ ] **Loading:** `Skeleton` sidebar + timeline + composer.

### M85 Wire real ErrorStates
- [ ] **Provider lost:** banner + retry.
- [ ] **Build failed:** error card + expandable log + retry.
- [ ] **Preview crashed:** "Preview failed" + diagnostic + retry.
- [ ] **Network error:** "No connection" + reconnect.
- [ ] **Rate limit:** banner + cooldown.

### M86 Wire real FileDiffView
- [ ] **`DiffPanel.tsx`** — file changes after build.
- [ ] **`FileDiffView`** — inline diff +/- highlighted.
- [ ] **Plain-terms summary** not raw diff.

### M87 Wire real Responsive/Mobile
- [ ] **Mobile bottom nav:** icon+label Chats/Projects/Settings.
- [ ] **FAB** for new project.
- [ ] **Sidebar collapses to bottom nav** on mobile.
- [ ] **Composer full-width** on mobile.

### M88 Wire real Onboarding
- [ ] **Tour:** (1) Create project, (2) Type what to build, (3) Watch it generate, (4) Preview.
- [ ] **"Skip" + `localStorage` `seen`.**

### M89 Wire real ErrorBoundary + LoadingStates
- [ ] **`<ErrorBoundary>`** + "Reload".
- [ ] **Initial load:** `Skeleton` sidebar + timeline + composer.
- [ ] **Thread switching:** skeleton timeline.
- [ ] **Project creation:** spinner.
- [ ] **Preview starting:** skeleton.

### M90 Wire real Accessibility
- [ ] **`aria-label`** on all interactive elements.
- [ ] **Focus management** after send → timeline bottom.
- [ ] **`aria-live="polite"`** on streaming text.
- [ ] **Skip-to-content** link.
- [ ] **Contrast ≥4.5:1.**

### M91 Wire real Performance
- [ ] **`React.lazy`** for heavy components.
- [ ] **Virtualized timeline** >100 messages.
- [ ] **Image optimization** WebP/lazy.
- [ ] **Code splitting** routes.
- [ ] **`useMemo`/`useCallback`** ChatView.

### M92 Wire real Notifications
- [ ] **Toast** build/preview/rate-limit/provider.
- [ ] **Wire `toastManager`** to events.
- [ ] **Auto-dismiss 5s.**

### M93 Wire real provider streaming end-to-end (M73 retry with real API key)
- [ ] **`POST /api/harness/stream`** → `endpointForModel` per Go docs (`grok/gpt→/responses`, `minimax/qwen→/messages`, `gemini→/models/<id>`).
- [ ] **Real OpenCode `https://opencode.ai/zen/v1` stream → tokens.**
- [ ] **No echo fallback.**

### M94 Wire real PreviewStage verification (M74 retry)
- [ ] **`POST /api/harness/verify`** → `caideRunner.verifySlice` → `CheckpointCard` real data.
- [ ] **`artifact_updated` push** not poll.

### M95 Final acceptance
- [ ] **`bun typecheck` + `bun lint` green.**
- [ ] **Create `Blank/RN/Flutter/Website` projects** → persist icons → restart → icons still there.
- [ ] **`hey` in `ask/plan/build`** → real streaming → timeline → checkpoint → approve → preview.
- [ ] **2 projects×N chats concurrent+restart zero cross-talk.**
- [ ] **Long-chat compaction@70%.**
- [ ] **Preview+build green per framework.**
- [ ] **Mobile bottom nav + FAB functional.**
- [ ] **Theme switcher works (light/dark/system).**

---

## 11. Handoff

Next commit: execute `M28-M52` bundle (delete dead web code + rebuild real server + `ChatView` + `MessagesTimeline` + `CreateAppDialog` + `Settings` + `EmptyStates` + `ErrorStates` + `KeyboardShortcuts` + `Responsive` + `Onboarding` + `ErrorBoundary` + `Performance` + `Notifications`). Then wire `M53-M95` for end-to-end provider streaming + preview verification + real CRUD. Auth excluded per user directive.
