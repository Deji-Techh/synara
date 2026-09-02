# 005 — Caide Master Build Plan

## The World's Best AI App Builder

> **This is the single source of truth. Supersedes `004-caide-pure-harness.md`.**
> **Every session: re-read `AGENTS.md` then re-read this file before doing anything.**
> **One milestone = one commit. Never leave a milestone half-done across sessions.**

---

## Mission

Build the best AI app builder ever made. Better than Lovable, Bolt, v0, Cursor, Replit Agent — not incrementally better, categorically better. The difference:

- **Lovable/Bolt**: generate code, show preview, hope it works. No real verification. No visual self-review. No edge cases. No motion. Flat prompts.
- **Caide**: a proper agent harness where a Router picks the right model, a Planner creates a real spec, a Builder generates per-slice with fresh context, a Verifier screenshot-compares output to design tokens (exact, not vibes), a Fixer patches failures, and a Taste model ensures it feels premium. Every screen gets empty/loading/error states. Motion is first-class. The harness self-improves across projects.

---

## What We Keep (The Shell)

The web UI stays **almost entirely as-is**. It is the shell. We are NOT deleting `ChatView`, `Sidebar`, `Profile`, settings panels, routes, etc.

What we strip is the **backend engine** that powers the shell:

| Keep (UI Shell)                             | Strip (Old Engine)                           |
| ------------------------------------------- | -------------------------------------------- |
| `ChatView.tsx` and all its variants         | `codexAppServerManager.ts` (4331 lines)      |
| `Sidebar.tsx` and all logic                 | `orchestration/` entire directory            |
| All settings panels incl. Profile           | `agentGateway/` entire directory             |
| All routes                                  | `checkpointing/` entire directory            |
| All components/ui                           | `automation/` entire directory               |
| `ProfileSettingsPanel.tsx`                  | `browserAutomation/` entire directory        |
| `FrameworkIcon`, `CaideLogo`, `Icons`       | `wsTransport.ts` (68K — old event model)     |
| `lib/disclosureMotion.ts`                   | `wsNativeApi.ts` (47K — old native API)      |
| `theme/`, `lib/`                            | `storeEventReducer.ts` (65K — Codex events)  |
| `Electron desktop (all 24 core files)`      | `storeProjection.ts` (56K — Codex events)    |
| Profile feature                             | `storeNormalization.ts` (71K — Codex events) |
| Git, terminal, auth, device infra on server | `workLog.ts` (72K — old agent events)        |

**The UI stays. The engine goes. We rebuild the engine. We rewire the UI to the new engine via typed WS events.**

---

## Architecture Overview

```
USER (browser / Electron window)
    ↕  WebSocket  {token|tool_call|stage|checkpoint|artifact_updated}
apps/server
    ├─ WS endpoint (thin — auth, project routing)
    ├─ harness/
    │   ├─ router/        → cheap/fast: classify intent, pick model+skills
    │   ├─ planner/       → spec.md gate: who, 3-5 flows, platform, v1 scope
    │   ├─ builder/       → per-slice fresh context, write code, call tools
    │   ├─ verifier/      → fresh context (never sees builder trace), screenshot→design-token compare
    │   ├─ fixer/         → targeted patch on verifier failures
    │   ├─ taste/         → aesthetic + anti-slop + motion pass (cheap model)
    │   ├─ loop/          → stateless runLoop: while(steps<max && !signal.aborted)
    │   ├─ turn/          → TurnFlow state machine: created→running→waiting→terminal
    │   ├─ session/       → append-only JSONL log, parentUuid chain
    │   ├─ prompts/       → L0+L1+L2+L3 assembly, {{var}} strict rendering
    │   ├─ tools/         → defineTool DSL, ToolScheduler conflict graph, concurrency
    │   ├─ context/       → ContextMemory, projection ladder (normal→media-degraded→strict)
    │   ├─ compaction/    → rolling summary @70%, artifact-over-conversation, per-slice isolation
    │   ├─ inbox/         → next-turn vs next-step, steer/inject/cancel/whenIdle
    │   ├─ permission/    → yolo|tier1-auto|manual policy chain
    │   ├─ scaffold/      → framework templates (blank|rn|flutter|website)
    │   ├─ preview/       → fingerprintFiles SHA256, watchProjectTree 450ms debounce
    │   ├─ checkpoint/    → human gate: Approve / Request change / View diff
    │   ├─ quality/       → edge sweep, adversarial, coherence, security, perf, benchmark
    │   └─ selfImprove/   → cross-project skill refinement loop
    ├─ design/tokens.ts   → compiled design tokens (colorTokens, typeScale, componentRules)
    └─ framework/registry → blank|rn|flutter|website → scaffold, prompts, tools, preview, build

apps/web (UI shell — mostly untouched)
    New: wsTransport.ts  → handles only typed harness envelopes
    New: harnessStore.ts → lean store driven by {token,tool_call,stage,checkpoint,artifact_updated}
    Keep: all existing components wired to harnessStore instead of old storeEventReducer

packages/contracts
    New: harnessEvents.ts → typed WS envelope schemas
    New: sessionContracts.ts
    New: projectContracts.ts
    Keep: baseSchemas.ts, projectFramework.ts
```

---

## Skill Packs (compiled from reference repos)

Every build injects skill packs as Layer 3 prompts. Stolen from dyad x caide and enriched:

```
harness/skills/
├─ ui-ux-mastery/          → product archetypes, design system, component contracts,
│                             a11y, anti-slop, design-to-code, platform patterns, quality rubric, motion direction
├─ motion-interaction/     → timing curves, spring physics, gesture choreography, haptics
├─ product-flow/           → spec.md construction, user flows, empty/loading/error states
├─ anti-ai-slop/           → anti-generic, anti-gradient-abuse, anti-glassmorphism defaults
├─ backend-production/     → security, data model correctness, API contracts
├─ onboarding-welcome/     → top welcome screens study, reduced-motion, branding
└─ platform-patterns/      → iOS SF Symbols, Android Material, cross-platform rules
```

---

## Prompt Architecture (L0–L3)

```
L0  Identity Core        (~300-500 tokens, always present, cached)
    Who the agent is. Absolute non-negotiables. Output format conventions.
    Never changes within a session.

L1  Role Prompt          (swapped per role, cached per role-swap)
    Router | Planner | Builder | Verifier | Fixer | Taste
    Each role explicitly states: allowed tools, success criteria, what it cannot do.
    Builder: "You do not judge your own work as complete. The Verifier does."
    Verifier: "You never see the builder's trace. You compare output to design tokens directly."

L2  Stage Context        (injected by harness, per state machine stage)
    Current stage, available artifacts, exit gate, what was just completed.
    Pulls from state machine, not hand-written.

L3  Resolved Skills      (injected per task, sub-filtered)
    Atomic skill files from harness/skills/ resolved by retrieval step.
    Only the relevant skills for the current slice/role.
    This is the only layer that grows/shrinks per call.

Composition: L0+L1 always cached. L2+L3 dynamic. Never pay full token price
on identity/role for every call.
```

---

## Design Token System

Every generated app has a `.caide/design-spec.json` (stolen from dyad x caide pattern):

```json
{
  "colorTokens": { "background": "#0D0D0D", "accent": "#E8493C", "textPrimary": "#FFFFFF" },
  "typeScale": { "headline": "24/bold", "body": "15/regular", "caption": "13/regular" },
  "componentRules": {
    "emptyState": "illustration grayscale soft + bold headline + muted subtext + optional single CTA",
    "primaryButton": "white pill, dark text, full-width, 44px min tap",
    "searchBar": "pill floating with padding, contextual placeholder"
  },
  "motion": {
    "spring": "stiffness:400 damping:30",
    "default": "200ms ease-out",
    "reduced": "prefers-reduced-motion:0ms"
  },
  "iconPack": "phosphor-duotone",
  "spacingUnit": 4
}
```

The Verifier does **exact token comparison** against this file, not aesthetic judgment. If `background` token is missing from any component, Verifier fails that slice.

---

## Verification Gate System

**Every milestone has explicit pass criteria. Nothing proceeds until criteria are met.**

Notation used below:

- `✓ BUILD` — `bun build` (or framework equivalent) passes with zero errors
- `✓ TYPE` — `bun typecheck` passes
- `✓ TEST` — `bun run test` passes for affected files
- `✓ BOOT` — server starts, connects to web client, no console errors
- `✓ MANUAL` — specific UI action must work as described
- `✓ LINT` — `bun lint` passes

---

# PHASE 0 — Strip (M0)

**Do this before any harness work. The old engine must be gone before the new one is wired.**

## M0.1 — Strip Server Engine

**Actions:**

1. Delete these server directories entirely:
   - `apps/server/src/orchestration/`
   - `apps/server/src/agentGateway/`
   - `apps/server/src/checkpointing/`
   - `apps/server/src/automation/`
   - `apps/server/src/browserAutomation/`
2. Delete these server root files:
   - `codexAppServerManager.ts` + `.test.ts`
   - `codexAppServerTransport.ts` + `.test.ts`
   - `codexErrorClassification.ts`
   - `codexGeneratedImages.ts` + `.test.ts`
   - `codexHomePaths.ts` + `.test.ts`
   - `codexProcessEnv.ts` + `.test.ts`
   - `codexTurnInput.ts` + `.test.ts`
   - `codexWorkingDirectory.ts`
   - `caideAppScaffold.ts`
   - `providerUsageSnapshot.ts`
   - `profileStats.ts` + `.test.ts`
   - `profileStatsArchive.ts` + `.test.ts`
   - `wsSnapshotLiveStream.ts` + `.test.ts`
   - `wsStreamAdmission.ts` + `.test.ts`
   - `wsStreamBackpressure.ts` + `.test.ts`
   - `wsProjectGuards.ts` + `wsProjectHandlers.ts`
   - `managedWorktrees.ts` + `.test.ts`
   - `managedAttachmentStore.ts` + `managedAttachmentCleanup.ts` + `.test.ts` + `managedAttachmentPrincipal.ts`
   - `localServerMonitor.ts` + `.test.ts`
   - `editorAppDiscovery.ts` + `editorAppIcons.ts` + `.test.ts`
   - `threadRetention.ts` + `.test.ts`
   - `worktreeSetup.ts` + `.test.ts`
   - `gitHandoffOperations.ts` + `.test.ts`
   - `voiceTranscription.ts` + `.test.ts` + `voiceUploadAdmission.ts` + `.test.ts`
   - `devServerManager.ts` + `.test.ts`
   - `localImageFiles.ts` + `.test.ts` + `localImageRoute.test.ts`
   - `shellCommandDetection.ts` + `.test.ts`
   - `providerChildEnvironment.ts` + `.test.ts`
   - `providerCredentials.ts` + `.test.ts`
   - `scratchWorkspaces.ts` + `.test.ts`
   - `processArgumentRedaction.ts` + `.test.ts`
   - `processRunner.ts` + `.test.ts`
   - `siteFaviconCache.ts` + `.test.ts`
   - `memoryDiagnostics.ts` + `.test.ts`
   - `wsConnectionSessions.ts` + `.test.ts`
   - `wsRequestAdmission.ts` + `.test.ts`
   - `attachmentPaths.ts` + `attachmentStore.ts` + `.test.ts`
   - `pullRequests.logic.ts` + `.test.ts`
   - `pullRequests/` entire dir
   - `privatePathPermissions.ts`
3. Strip `apps/server/src/serverLayers.ts` — remove all orchestration/agentGateway/checkpointing/automation/browserAutomation imports. Leave: git, terminal, device, auth, persistence infra.
4. Strip `apps/server/src/wsRpc.ts` — remove the 29 orchestration imports. Replace `OrchestrationEngineService` references with a stub `TODO: wire harness runner` comment. Keep: auth, git, terminal, device, config RPC skeleton.
5. Strip `apps/server/src/main.ts` — remove orchestration engine startup. Keep: CLI, config, HTTP server bootstrap.
6. Strip `apps/server/src/http.ts` — remove agentGateway/orchestration routes. Keep: static asset serving, auth routes.
7. Delete harness stubs — everything in `apps/server/src/harness/` EXCEPT:
   - `harness/turn/index.ts` (real TurnFlow — keep)
   - `harness/turn/runner.ts` (real CaideRunner — keep)
   - `harness/loop/loop.ts` (real loop — keep)
   - `harness/session/index.ts` (real Session — keep)
   - `harness/provider/apiAdapter.ts` (real provider adapter — keep)
   - `harness/router/index.ts` (real router — keep)
   - `harness/framework/registry.ts` (real framework registry — keep)
   - `harness/verifier/index.ts` (real verifier — keep)
   - `harness/index.ts` (barrel — keep, update)
   - `harness/server.ts` (wiring — keep, update)
   - `harness/prompts/registry.ts` (real — keep)
   - `apps/server/src/design/tokens.ts` (real — keep)

## M0.2 — Strip Web Old Engine Layer

**Actions — only touch the coupling layer, NOT the UI components:**

1. Delete these web files (old engine coupling, not UI):
   - `wsTransport.ts` + `.test.ts` — old 68K transport
   - `wsNativeApi.ts` + `.test.ts` — old 47K native API
   - `wsTransportEvents.ts` + `.test.ts`
   - `storeEventReducer.ts` + `.test.ts` — 65K Codex event reducer
   - `storeProjection.ts` + `.test.ts` — 56K Codex projection
   - `storeNormalization.ts` + `.test.ts` — 71K Codex normalization
   - `store.ts` + `.test.ts` — 16K old store (Codex-driven)
   - `storeState.ts`, `storeSelectors.ts` + `.orig`, `storePersistence.ts`, `storeTestFixtures.ts`
   - `session-logic.ts` + `.test.ts`
   - `workLog.ts` + `.test.ts` — 72K old agent work log
   - `pendingInteractionDerivation.ts` + `.test.ts`
   - `pendingTurnDispatch.ts`, `pendingUserInput.ts` + `.test.ts`
   - `usePendingInteractionHooks.ts`
2. Delete out-of-scope feature files (keep UI components for these — just the store/logic):
   - `goalStore.ts`, `kanbanUiStore.ts`
   - `pinnedMessages.ts` + `.test.ts`, `pinnedProjectsStore.ts` + `.test.ts`, `pinnedThreadsStore.ts` + `.test.ts`
   - `pinning.logic.ts` + `.test.ts`
   - `voidSpaceStore.ts` + `.test.ts`, `spacesUiStore.ts` + `.test.ts`
   - `collectionsStore.ts` + `.test.ts`
   - `pullRequestReference.ts` + `.test.ts`, `repoDiffScopeStore.ts`
   - `worktreeCleanup.ts` + `.test.ts`, `proposedPlan.ts` + `.test.ts`
   - `feedback.ts` + `.test.ts`, `feedbackDialogStore.ts`
   - `splitViewStore.ts` + `.test.ts`, `splitView.logic.ts` + `.test.ts`
   - `rightDockStore.ts` + `rightDockStore.logic.ts` + `.test.ts`
   - `settingsSearchIndex.ts`, `shortcutsSheet.ts` + `.test.ts`
   - `keybindings.ts` + `.test.ts` (26K) — old keybindings coupling
   - `pairingBootstrap.ts` + `.test.ts`, `storageOriginMigration.ts` + `.test.ts`
   - `confirmedCustomBinaryPathStore.ts`
   - `recentViews.logic.ts` + `.test.ts`, `recentViewsStore.ts`, `recentViewActivation.logic.ts` + `.test.ts`
   - `chatRouteRecovery.ts` + `.test.ts`, `chatRouteRestore.ts` + `.test.ts`
   - `threadSelectionStore.ts` + `.test.ts`
   - `threadDetailPrewarm.ts` + `.test.ts`, `threadDetailResumeCursors.ts` + `.test.ts`
   - `threadDetailSubscriptionRetention.ts` + `.test.ts`
   - `threadActivation.logic.ts` + `.test.ts`, `threadDerivation.ts`, `threadMarkers.ts`
   - `providerModelOptions.ts` + `.test.ts`, `providerOrdering.ts` + `.test.ts`
   - `providerUpdates.ts` + `.test.ts`, `cursorModelVariants.ts` + `.test.ts`
   - `engineSubagentStore.ts`
   - `terminalStateStore.ts` + `.test.ts`, `terminalPaneLayout.ts`, `terminalActivity.ts` + `.test.ts`
   - `deviceStateStore.ts` + `.test.ts`, `latestProjectStore.ts`
   - `workflowRunUiStore.ts` + `.test.ts`, `workspacePathsStore.ts` + `.test.ts`
   - `projectRunStore.ts`, `projectRunTargets.ts` + `.test.ts`
   - `projectScripts.ts` + `.test.ts`, `projectTerminalRunner.ts` + `.test.ts`
   - `projectInstructionsStore.ts` + `.test.ts`, `temporaryThreadStore.ts`
   - `composerDraftActions.ts`, `composerDraftAttachments.ts`, `composerDraftDomain.ts`
   - `composerDraftModels.ts`, `composerDraftPersistence.ts`, `composerDraftStore.*`
   - `composerSlashCommands.ts` + `.test.ts`, `composerFocusRequestStore.ts`
   - `composerTriggerInsertion.ts`, `composer-editor-mentions.ts` + `.test.ts`
   - `settingsNavigation.ts`, `settingsPanelStyles.ts`, `settingsSidebarNavStyles.ts`
   - `diffRouteSearch.ts` + `.test.ts`
3. Delete web route logic files (keep route shells, delete old logic):
   - `routes/-chatIndexRoute.logic.ts`
   - `routes/-chatThreadRoute.logic.*`
   - `routes/-rootEventInvalidation.*`
   - `routes/-threadDetailOwnership.*`
   - `routes/-automations.shared.*`
4. Delete out-of-scope web route files entirely:
   - `routes/_chat.automations.*`
   - `routes/_chat.kanban.*`
   - `routes/_chat.plugins.tsx`
   - `routes/_chat.pull-requests.*`
5. Delete web harness stub: `apps/web/src/harness-stub/` entire dir
6. Delete `apps/web/src/components/settings/`:
   - `ExternalMcpSettingsPanel.tsx` + `externalMcpSetup.*`
   - `SkillsSettingsPanel.tsx` + `skillsSettingsModel.*`
   - `KeyboardShortcutsSettingsPanel.tsx`
   - `AppIconPicker.tsx` + `.browser.*`
   - `AdvancedSettingsPanel.tsx` + `.browser.*`
   - `ConversationStorageSettingsPanels.tsx` + `.browser.*`
   - `DesktopSettingsPanels.tsx` + `.browser.*`
   - (Keep: `ThemeModePicker.tsx`, `PaletteSwatchPicker.tsx`, `SettingControls.tsx`, `SettingsPanelPrimitives.tsx`, `DebouncedSettingTextInput.tsx`, `ProfileSettingsPanel.tsx`, `ModelsSettingsPanel.tsx` — we keep and rebuild these)
7. Delete: `ProvidersSettingsPanel.tsx` + `.test.ts` (rebuild as new unified provider panel)

## M0.3 — Strip Desktop Engine

**Actions:**

1. Delete `apps/desktop/src/browserAutomation/` (28 files)
2. Delete `apps/desktop/src/browserAnnotations/` (11 files)
3. Delete `apps/desktop/src/updateMachine.ts`
4. Delete `apps/desktop/src/backendSupervisionPolicy.ts`
5. Delete any `*Codex*` files in desktop src

## M0.4 — Strip Packages/Contracts

**Actions:**

1. In `packages/contracts/src/`:
   - Delete `orchestration.ts` + `.test.ts`
   - Delete `automation.ts`
   - Delete any `agentGateway*.ts`
   - Delete `checkpointing.ts`

## M0.5 — Strip Root Junk

**Actions:**

1. Delete from repo root:
   - `fix_dyad_refs.ts`, `make_agnostic.ts`, `inline-raw.ts`
   - `patch_engine.cjs`, `patch_engine2.cjs`, `patch_engine3.cjs`, `patch_engine_test.cjs`
   - `check.js`, `check-rpc.mjs`, `test-rpc.js`
   - `update_tools.ts`
   - `issue-packaged-engine-could-not-spawn.md`
2. Delete `apps/engine/` (already archived in `backup/dyad-engine-transplant`)
3. Delete `workers/` (Codex workers)
4. Delete root-level `scaffold-api/` and `scaffold-flutter/` (will live inside harness)
5. Delete `advisor-plans/`, `audit/`, `benchmarks/`, `testing/`

## M0 Verification Gate

```
✓ BUILD: bun build passes (may have import errors — fix them by replacing deleted imports with TODO stubs)
✓ BOOT:  server starts (use isolated home dir per AGENTS.md)
✓ GIT:   git status clean
✓ COMMIT: "chore(m0): complete shell strip — old engine deleted, harness wire-up begins"
✓ PUSH:  pushed to origin/feature/shell-rebuild-v2
```

**DO NOT proceed to M1 until all M0 verification gates pass.**

---

# PHASE 1 — Contracts & Foundation (M1–M3)

## M1 — Typed WS Event Contracts

**Goal:** Define the single contract that the new harness uses to speak to the web UI. Every event that crosses the WS boundary has a schema. No raw strings.

**Files to create:**

- `packages/contracts/src/harnessEvents.ts`
- `packages/contracts/src/sessionContracts.ts`
- `packages/contracts/src/projectContracts.ts`

**`harnessEvents.ts` must define:**

```typescript
type HarnessEvent =
  | { type: "token"; sessionId: string; content: string }
  | {
      type: "tool_call";
      sessionId: string;
      id: string;
      name: string;
      args: unknown;
      status: "started" | "completed" | "failed";
      result?: unknown;
      durationMs?: number;
    }
  | { type: "stage"; sessionId: string; from: string; to: string; meta?: Record<string, unknown> }
  | {
      type: "checkpoint";
      sessionId: string;
      id: string;
      reason: string;
      requiresResponse: boolean;
      diff?: string;
    }
  | {
      type: "artifact_updated";
      sessionId: string;
      path: string;
      framework: ProjectFramework;
      sizeBytes: number;
    }
  | { type: "turn_start"; sessionId: string; turnId: string; prompt: string }
  | { type: "turn_end"; sessionId: string; turnId: string; status: TurnStatus }
  | {
      type: "verifier_result";
      sessionId: string;
      passed: boolean;
      confidence: number;
      tasteScore: number;
      issues: string[];
    }
  | { type: "compaction"; sessionId: string; reason: string; summaryLength: number }
  | { type: "error"; sessionId: string; code: string; message: string; recoverable: boolean };
```

**`sessionContracts.ts` must define:** `Session`, `Turn`, `TurnStatus`, `SessionEvent`, `SessionId`, `TurnId`

**`projectContracts.ts` must define:** `Project`, `Thread`, `ProjectId`, `ThreadId`, `ProjectFramework` (import from baseSchemas)

**M1 Verification Gate:**

```
✓ TYPE: packages/contracts bun typecheck passes
✓ TEST: all contracts have at least one type-level test (use satisfies operator)
✓ COMMIT: "feat(m1): typed WS harness event contracts"
```

## M2 — JSONL Session Storage

**Goal:** Append-only session log with `parentUuid` chain. Cheap to fork/resume. Never over-normalized.

**Reference:** claude-code `sessionStorage.ts:1416` pattern

**Files to create:**

- `apps/server/src/harness/session/storage.ts`
- `apps/server/src/harness/session/buildChain.ts`

**`storage.ts` must:**

- Write events as JSONL to `~/.caide/sessions/<sessionId>.jsonl`
- Each line: `{ type, seq, time, parentUuid, sessionId, data }`
- 100ms debounce write queue — never blocks hot path
- `reAppendSessionMetadata` on resume
- `recordTranscript` prefix filter — only user/assistant messages visible to model

**`buildChain.ts` must:**

- `buildConversationChain(sessionId)` → `Message[]` from JSONL
- Handles fork: follow `parentUuid` chain without loading siblings
- `buildMessages()` → filtered for role (Builder gets slice context, Verifier gets fresh)

**M2 Verification Gate:**

```
✓ TEST: write 100 events, crash, resume — chain is intact and ordered
✓ TEST: fork session — both chains are independent
✓ TEST: buildMessages() for Verifier never contains Builder tool calls
✓ COMMIT: "feat(m2): JSONL session storage with parentUuid chain"
```

## M3 — Stateless Loop + Inbox

**Goal:** The core execution engine. Stateless so it's testable with a fake LLM.

**Reference:** kimi-code `loop/run-turn.ts`, deepseek Inbox pattern

**Files to create/update:**

- `apps/server/src/harness/loop/loop.ts` (already exists, expand)
- `apps/server/src/harness/loop/retry.ts`
- `apps/server/src/harness/loop/events.ts`
- `apps/server/src/harness/inbox/index.ts` (already exists as stub, implement)

**`loop.ts` must:**

- `runLoop(options: LoopOptions): AsyncGenerator<HarnessEvent>`
- `LoopOptions`: `{ maxSteps, signal, llm, buildMessages, tools, onEvent, role }`
- `while (steps < maxSteps && !signal.aborted)` guard
- Calls `llm.stream(messages)` → yields token events
- Parses tool calls from stream → validates schema → validates stage permission → executes → yields tool_call events
- On tool error: formats structured result (type, file/line, likely cause, suggested fix) — never raw stack trace
- `retry.ts`: exponential backoff 1s→2s→4s→8s, max 3 attempts, only on recoverable errors

**`events.ts` must:**

- `LoopRecordedEvent` — durable (token, tool_call completed, stage, checkpoint)
- `LoopLiveOnlyEvent` — ephemeral (token delta, tool progress)
- `safeEmitLive(event)` — never throws, never breaks turn execution

**`inbox/index.ts` must:**

- `Inbox` class with `next-turn` queue and `next-step` queue
- Methods: `steer(prompt)`, `inject(event)`, `cancel(cause)`, `whenIdle(cb)`
- `pre-step` waterfall: each registered handler can `reject | enter | pass`
- `followup` queue drains after turn completes

**M3 Verification Gate:**

```
✓ TEST: run 10 steps with fake LLM → events are emitted in order
✓ TEST: signal.abort() mid-step → loop stops cleanly, no dangling state
✓ TEST: tool error → structured result returned, not raw stack trace
✓ TEST: retry on recoverable error → 3 attempts with backoff, then fail
✓ TEST: inbox steer() during running turn → buffered, applied at next step
✓ COMMIT: "feat(m3): stateless loop, retry, events, inbox"
```

---

# PHASE 2 — Tools & Prompts (M4–M5)

## M4 — Tool DSL, Scheduler, Executor

**Goal:** Every tool has tight schema. Parallel reads, sequential writes. Sibling abort.

**Reference:** claude-code `StreamingToolExecutor.ts`, `defineTool` DSL, `ToolScheduler`

**Files to create:**

- `apps/server/src/harness/tools/defineTool.ts`
- `apps/server/src/harness/tools/toolScheduler.ts`
- `apps/server/src/harness/tools/executor.ts`
- `apps/server/src/harness/tools/registry.ts`
- `apps/server/src/harness/tools/coreTools.ts` (18 core tools)

**`defineTool.ts` must:**

```typescript
function defineTool<I, O>(def: {
  name: string;
  description: string; // written for model, includes explicit failure modes
  schema: ZodSchema<I>;
  readOnly: boolean; // true = can parallelize
  modifiesState: boolean;
  execute(input: I, ctx: ToolContext): Promise<O>;
  presentCall(input: I): string; // human-readable tool call card
  presentResult(output: O): string; // human-readable result card
}): ToolDef<I, O>;
```

**`toolScheduler.ts` must:**

- Build conflict graph from tool metadata
- `isConcurrencySafe(toolA, toolB)` — `readOnly && readOnly = safe`
- Parallel execution for safe pairs, sequential for unsafe
- `AbortController` hierarchy: `tool ← sibling ← query` (sibling abort on failure)

**`executor.ts` must:**

- Schema validation before execution (reject malformed)
- Stage/permission validation (reject legal-schema-but-wrong-timing with structured reason)
- Structured error formatting back to model

**18 Core Tools for `coreTools.ts`:**

```
read_file(path)                 → string           readOnly:true
write_file(path, content)       → void             readOnly:false
list_dir(path)                  → DirEntry[]       readOnly:true
search_files(pattern, dir)      → Match[]          readOnly:true
run_command(cmd, args, cwd)     → { stdout, stderr, exitCode }  readOnly:false
read_url(url)                   → string           readOnly:true
screenshot(selector?)           → base64           readOnly:true
get_design_tokens()             → DesignTokens     readOnly:true
read_spec()                     → SpecDoc          readOnly:true
write_spec(spec)                → void             readOnly:false
write_design_spec(spec)         → void             readOnly:false
write_motion_spec(spec)         → void             readOnly:false
install_package(name)           → void             readOnly:false
build_project()                 → BuildResult      readOnly:false
lint_project()                  → LintResult       readOnly:true  (effectively)
get_preview_url()               → string           readOnly:true
checkpoint(reason, diff)        → CheckpointResult readOnly:false
log_decision(decision, reason)  → void             readOnly:false
```

**M4 Verification Gate:**

```
✓ TEST: defineTool registers correctly, schema validation rejects bad input
✓ TEST: two readOnly tools run in parallel, write tools run sequential
✓ TEST: sibling abort — one tool fails, related concurrent tool is cancelled
✓ TEST: stage permission — tool called outside allowed stage returns structured error
✓ COMMIT: "feat(m4): tool DSL, scheduler, executor, 18 core tools"
```

## M5 — Prompt Registry (L0–L3)

**Goal:** Layered prompt assembly. `L0+L1` cached. `L2+L3` dynamic. `{{var}}` strict.

**Reference:** deepseek `system-prompt/src/index.ts` section/context/variable/tools pattern

**Files to create:**

- `apps/server/src/harness/prompts/registry.ts` (already exists, expand)
- `apps/server/src/harness/prompts/layers.ts`
- `apps/server/src/harness/prompts/assembler.ts`
- `apps/server/src/harness/prompts/roles/` (6 role prompts)
- `apps/server/src/harness/skills/` (skill pack directory)

**`assembler.ts` must:**

- `assemble(opts: { role, stage, skills, vars, framework })` → `Message[]`
- Strict `{{var}}` rendering — throw if variable missing, not silently skip
- `L0 + L1` always loaded from cache
- `L2` pulled from current stage state machine context
- `L3` resolved from `skills/` by `resolveSkills(role, stage, framework)`
- Token budget check — if assembled prompt > 90% of model context limit, log warning

**`roles/builder.ts` must include:**

- "You write code, never judge it complete. Only Verifier can pass a slice."
- "Per-slice fresh context — you do not see the history of previous slices."
- "Every screen you output must include empty state, loading state, and error state."
- "You follow `.caide/design-spec.json` for every token — no improvising colors or type."
- "Use `.caide/motion-spec.json` for every animation — no improvising timing."

**`roles/verifier.ts` must include:**

- "You never see the Builder's reasoning trace. Fresh context only."
- "Compare output files against `.caide/design-spec.json` exact token values."
- "Check every screen has: empty state, loading state, error state."
- "Check every interactive element has: 44px minimum tap target."
- "Output structured `VerifyResult { passed, confidence, tasteScore, issues[] }`."

**`roles/router.ts` must classify:**

- `ask` → answer only, no code, cheap model
- `plan` → spec.md creation, medium model
- `build` → code generation, strong model
- `verify` → screenshot + token compare, taste model
- `fix` → targeted patch, medium model
- Returns `{ intent, model, skills[], tier }` where tier = `yolo|tier1|manual`

**Skills in `harness/skills/`:**
Each skill is a `.md` file with YAML frontmatter `{ name, triggers, companions }`:

- `ui-ux-mastery.md` — product archetypes, design system, component contracts, a11y, anti-slop, quality rubric, motion direction
- `motion-interaction.md` — spring physics, gesture choreography, haptics mapping, timing curves
- `product-flow.md` — spec.md construction, empty/loading/error states, user flow validation
- `anti-ai-slop.md` — anti-generic, no default gradient abuse, no glassmorphism-as-polish, no lorem ipsum
- `backend-production.md` — security, data model correctness, license compliance
- `platform-patterns.md` — iOS SF Symbols, Android Material, cross-platform native feel

**M5 Verification Gate:**

```
✓ TEST: assemble() with all 6 roles produces non-empty prompt, no missing {{vars}}
✓ TEST: missing {{var}} throws, not silently skips
✓ TEST: token budget check triggers at 90% with correct model context limit
✓ TEST: skill resolution returns correct skills for each role+stage combo
✓ COMMIT: "feat(m5): layered prompt registry, roles, skill packs"
```

---

# PHASE 3 — Roles: Router + Planner (M6–M7)

## M6 — Router (Fast Classification)

**Goal:** Cheap, fast intent classification. Picks the right model, skills, and tier.

**Update:** `apps/server/src/harness/router/index.ts` (already exists, expand)

**Router must:**

- Use the **cheapest model** (not strong model — speed matters here)
- Classify in a single non-streaming call (<500ms target)
- Output `RouterDecision { intent, model, skills, tier, framework, confidence }`
- Confidence < 0.7 → default to `build` intent, flag for human checkpoint
- Router never calls tools, never writes files

**Intent → Model mapping:**

```
ask    → cheap model (gpt-5.6-sol or equivalent)
plan   → medium model (sonnet equivalent)
build  → strong model (fable or gpt-5.6-sol depending on task)
verify → taste model (opus or fable for aesthetic judgment)
fix    → medium model
```

**M6 Verification Gate:**

```
✓ TEST: 20 prompt samples → each classifies to correct intent
✓ TEST: ambiguous prompt → confidence < 0.7, defaults to build
✓ TEST: classification takes < 500ms (mock LLM, just test the logic)
✓ COMMIT: "feat(m6): router — fast intent classification"
```

## M7 — Planner (Spec Gate)

**Goal:** Force a real spec before any code. `spec.md` is the source of truth.

**Files to create:**

- `apps/server/src/harness/planner/index.ts` (stub exists, implement)
- `apps/server/src/harness/planner/specValidator.ts`

**Planner must:**

1. On first message for a new project: enter Plan mode
2. Ask (or infer) the required spec fields:
   - Primary user and their context
   - 3-5 core **flows** (not features — flows: "sign up → create item → share")
   - Platform (RN / Flutter / Website / Blank)
   - Explicit v1 out-of-scope list
3. Create `spec.md` and `architecture.md` at project root
4. Create `.caide/design-spec.json` and `.caide/motion-spec.json`
5. Present plan to user via `checkpoint` tool (human gate #1)
6. Only after user approves: transition to Builder

**`specValidator.ts` must:**

- Validate spec has all required fields
- Validate 3-5 flows (not just feature list)
- Validate platform is one of the 4 framework types
- Reject spec with >10 v1 features (scope creep guard)
- Return `{ valid, missing, warnings }`

**Plan mode UI card (sent as checkpoint event):**

```
📋 App Plan: [App Name]
User: [who they are]
Flows:
  1. [Flow 1]
  2. [Flow 2]
  3. [Flow 3]
Out of scope for v1: [list]
Framework: React Native
[Approve] [Request Change] [Edit Spec]
```

**M7 Verification Gate:**

```
✓ TEST: first message for new project → Plan mode entered, not Builder
✓ TEST: plan approval → spec.md created with all required fields
✓ TEST: spec with missing fields → validation fails with clear message
✓ TEST: checkpoint event emitted with correct format
✓ MANUAL: user sees plan card in ChatView, can approve
✓ COMMIT: "feat(m7): planner with spec gate and human checkpoint"
```

---

# PHASE 4 — Roles: Builder + Verifier + Fixer (M8–M10)

## M8 — Builder (Per-Slice, Fresh Context)

**Goal:** One complete flow at a time. Each slice gets a fresh context. Never accumulate across slices.

**Files to create:**

- `apps/server/src/harness/builder/index.ts` (stub exists, implement)
- `apps/server/src/harness/slice/index.ts` (stub exists, implement)

**Builder must:**

1. Read `spec.md`, `architecture.md`, `.caide/design-spec.json`, `.caide/motion-spec.json`
2. Identify the current slice (one complete flow: UI + state + data + edge cases)
3. Create **fresh context** for this slice — does NOT inherit Builder history from previous slices
4. Build the slice:
   - UI components (complete, no TODOs, no placeholders)
   - State management for this flow
   - Data layer (API calls, local state)
   - **Required: empty state, loading state, error state** for every screen
   - **Required: 44px minimum tap targets**
5. Follow `.caide/design-spec.json` exactly — every color, type scale, spacing
6. Follow `.caide/motion-spec.json` — every transition timing, spring config
7. Run `build_project()` tool → on error, self-patch up to 2 times before calling Fixer
8. Emit `artifact_updated` event for each file written
9. Pass to Verifier when slice is built

**Anti-patterns that MUST be prevented:**

- No lorem ipsum or placeholder data
- No `// TODO: implement` in generated code
- No `console.log` left in production code
- No hardcoded credentials or API keys
- No generic "AI-slop" aesthetic (gradient text, glassmorphism by default)

**`slice/index.ts` must:**

- Track which slices are complete, which are pending
- `getNextSlice(spec)` → returns the highest-priority incomplete slice
- Slice isolation: each slice gets its own context window
- After Verifier passes: mark slice complete, persist to session log

**M8 Verification Gate:**

```
✓ TEST: builder builds a screen with all required states (empty, loading, error)
✓ TEST: builder follows design tokens exactly (color, type, spacing)
✓ TEST: fresh context — slice 2 does not have slice 1's tool calls in context
✓ TEST: build error → self-patch attempt → structured failure if still failing
✓ COMMIT: "feat(m8): builder — per-slice fresh context, design token compliance"
```

## M9 — Verifier (Screenshot + Token Compare)

**Goal:** Never see the Builder's trace. Compare output directly to design tokens. Screenshot.

**Update:** `apps/server/src/harness/verifier/index.ts` (real implementation exists, expand)
**Add:** `apps/server/src/harness/verifier/visual.ts` (already exists, expand)
**Add:** `apps/server/src/harness/verifier/tokenCompare.ts`

**Verifier must:**

1. Load `.caide/design-spec.json` and `.caide/motion-spec.json`
2. Read built files (no access to Builder's reasoning context)
3. **Token comparison checks:**
   - Every component uses `colorTokens.background` not hardcoded `#0D0D0D`
   - Every interactive element ≥ 44px tap target
   - Every screen has empty state, loading state, error state
   - Type scale matches `typeScale` tokens
   - Spacing is multiples of `spacingUnit`
4. **Screenshot check (when preview available):**
   - Call `screenshot()` tool
   - Compare screenshot to reference design tokens visually
   - Score: `tasteScore 0.0–1.0`
5. **Output:** `VerifyResult { passed, confidence, tasteScore, issues[] }`
   - `confidence < 0.75` → flag for human glance (low-confidence queue)
   - `tasteScore < 0.7` → send to Taste role for aesthetic pass
   - `passed: false` → send to Fixer with `issues[]`

**M9 Verification Gate:**

```
✓ TEST: file with wrong color token → verifier catches it, issues[] contains specific token
✓ TEST: missing empty state → verifier catches it
✓ TEST: tap target < 44px → verifier catches it
✓ TEST: passed files → confidence > 0.85, tasteScore > 0.8
✓ COMMIT: "feat(m9): verifier — token compare, screenshot, structured result"
```

## M10 — Fixer (Targeted Patch)

**Goal:** Receive Verifier issues, patch surgically, never re-generate entire files.

**Files to create:**

- `apps/server/src/harness/fixer/index.ts` (stub exists, implement)

**Fixer must:**

- Receive `VerifyResult.issues[]` — specific, actionable items only
- Generate minimal targeted patches (not whole-file rewrites)
- Max 3 fix attempts per issue before escalating to human checkpoint
- Track fix history — if same issue recurs after fix, flag as systemic (update skill pack)
- After fix: re-run Verifier (not Builder — don't lose context)
- Emit `stage { from: 'fixing', to: 'verifying' }` event

**M10 Verification Gate:**

```
✓ TEST: wrong token → fixer patches exactly that line, not surrounding code
✓ TEST: 3 failed fix attempts → checkpoint event emitted for human review
✓ TEST: fix → re-verify cycle → passes on second attempt
✓ COMMIT: "feat(m10): fixer — targeted patch, max retries, human escalation"
```

---

# PHASE 5 — Provider + Streaming (M11–M12)

## M11 — Provider Abstraction (Real API Calls)

**Goal:** Real streaming calls to OpenCode Zen/Go per model routing. No stubs.

**Update:** `apps/server/src/harness/provider/apiAdapter.ts` (already exists, expand)
**Add:** `apps/server/src/harness/provider/stream.ts`
**Add:** `apps/server/src/harness/provider/models.ts`

**`apiAdapter.ts` must:**

- Route by model prefix: `grok/gpt/o1/o3` → `/zen/v1/responses`, `claude/minimax/qwen` → `/zen/v1/messages`, fallback → `/zen/go/v1/chat/completions`
- Handle SSE streaming for all endpoints
- Parse `data: {...}` lines, extract delta tokens per endpoint format
- `SIGTERM` support: `signal.aborted` checked at each chunk, reader cancelled cleanly
- Structured error: on non-2xx, extract `{ code, message, retryable }` not raw HTTP error

**`stream.ts` must:**

- `streamProvider(opts): AsyncGenerator<string>` → yields token strings
- `BlockAssembler` — assembles partial tool call JSON across chunks
- `LLMStreamTiming` — tracks TTFT (time to first token), reports in `stage` event

**`models.ts` must:**

- Define available models with their endpoint, context window, cost tier
- `getModel(intent, tier)` → resolves the correct model per Router decision
- Model fallback chain: if primary fails, downgrade to next tier

**M11 Verification Gate:**

```
✓ TEST: mock HTTP server → streamProvider yields tokens in order
✓ TEST: SIGTERM mid-stream → generator stops, reader cancelled, no memory leak
✓ TEST: non-2xx response → structured error with retryable flag
✓ TEST: BlockAssembler reassembles tool call split across 5 chunks
✓ MANUAL: make one real API call to provider → tokens stream to web UI
✓ COMMIT: "feat(m11): real provider streaming with SIGTERM, block assembly"
```

## M12 — Dual Stream to Web (Token SSE + Event WS)

**Goal:** Two separate channels to the UI. Token stream for perceived speed. Event stream for UI state.

**Files to create:**

- `apps/server/src/harness/ws/server.ts` (replaces stub ws/ directory)
- `apps/web/src/wsTransport.ts` (NEW — replaces deleted old one, lean)
- `apps/web/src/harnessStore.ts` (NEW — lean store for harness events)

**Server `ws/server.ts` must:**

- Accept WS connection, authenticate (reuse existing auth middleware)
- Register session with `CaideRunner`
- Forward `HarnessEvent` to connected client — typed, not raw strings
- `SIGTERM` channel: client can send `{ type: 'cancel', sessionId }` → `CaideRunner.cancel()`
- Reconnect handling: on reconnect, replay last N events from JSONL log

**Client `wsTransport.ts` must:**

- Lean — handles ONLY `HarnessEvent` types from `@caide/contracts`
- `connect(url)` → `EventEmitter<HarnessEvent>`
- Auto-reconnect with exponential backoff
- Heartbeat ping every 15s
- `cancel(sessionId)` → sends cancel message to server
- No orchestration concepts, no old event types

**Client `harnessStore.ts` must:**

- `useHarnessStore()` → Zustand/Jotai store driven by `HarnessEvent` stream
- State shape: `{ sessions: Map<SessionId, SessionState>, activeSessionId }`
- `SessionState { tokens: string[], turns: Turn[], stage: string, checkpoint?: Checkpoint, verifierResult?: VerifyResult, artifacts: ArtifactEntry[] }`
- Update UI components by dispatching to this store
- All existing UI components that reference old orchestration store → migrate to `useHarnessStore()`

**M12 Verification Gate:**

```
✓ BOOT: server starts, web connects, WS handshake succeeds
✓ MANUAL: send a prompt → token events appear in ChatView in real time
✓ MANUAL: stage events update the status pill in ChatView
✓ MANUAL: cancel button → turn stops cleanly
✓ TEST: wsTransport reconnects automatically after disconnect
✓ COMMIT: "feat(m12): dual WS+SSE streaming, lean wsTransport, harnessStore"
```

---

# PHASE 6 — Context + Compaction (M13–M14)

## M13 — ContextMemory + Projection Ladder

**Goal:** Smart context management. Never truncate mid-thought. Degrade gracefully.

**Reference:** kimi-code `ContextMemory`, `projector.ts` media ladder

**Files to create:**

- `apps/server/src/harness/context/index.ts` (stub exists, implement)
- `apps/server/src/harness/context/projector.ts`
- `apps/server/src/harness/context/memory.ts`

**`memory.ts` must track:**

- `pendingToolResultIds` — tool calls sent, results not yet received
- `openSteps` — steps started but not completed
- `deferredMessages` — messages queued for next step
- Invariant: `model-visible ↔ logged` — every event in JSONL is in context or explicitly excluded

**`projector.ts` must implement projection ladder:**

```
Normal      → full messages, all attachments
Media-degraded → drop image attachments, keep text
Media-stripped → drop all attachments
Strict      → drop all media + any tool result > 2000 tokens (summarize)
Emergency   → only last N turns + spec.md + current slice spec
```

**Context budget tracking:**

- Count tokens before each call (use model's tokenizer or character estimate)
- At 70%: prepare compaction
- At 85%: execute compaction
- At 95%: emergency — switch to Emergency projection

**M13 Verification Gate:**

```
✓ TEST: context at 71% → compaction prepared (not yet executed)
✓ TEST: context at 86% → compaction executed, summary injected, old messages removed
✓ TEST: projection ladder — each level correctly removes content
✓ TEST: invariant holds — every logged event is either in context or in summary
✓ COMMIT: "feat(m13): ContextMemory with projection ladder"
```

## M14 — Rolling Compaction @70%

**Goal:** Proactive, not reactive. Happens at clean boundaries. Uses cheap model.

**Files to create:**

- `apps/server/src/harness/compaction/index.ts` (stub exists, implement)
- `apps/server/src/harness/compaction/summarizer.ts`

**`compaction/index.ts` must:**

- Trigger at 70% context budget (not 100% — proactive)
- Always trigger at clean boundary (end of tool call, not mid-reasoning)
- `isCompacting` latch — only one compaction at a time
- Emit `{ type: 'compaction', reason, summaryLength }` event to UI

**`summarizer.ts` must:**

- Call cheap model with: "Summarize what was built, decisions made, what's pending"
- Output: `{ builtSummary, pendingSlices, keyDecisions, artifactList }`
- Store summary in JSONL as a special `compaction_summary` event
- After compaction: context contains summary + last 3 turns + always-persistent (spec.md, design-spec.json, current slice)

**Artifact-over-conversation principle:**

- `spec.md`, `architecture.md`, `.caide/design-spec.json`, `.caide/motion-spec.json` are always present — never compacted
- Conversation doesn't re-derive what's in these files — it references them

**Per-slice isolation:**

- Each new slice starts with: `L0 + L1 + L2(stage) + L3(skills) + spec.md + slice-spec`
- Does NOT inherit the previous slice's conversation history
- Prevents cross-slice confusion/drift

**M14 Verification Gate:**

```
✓ TEST: compaction triggers at 70%, not 100%
✓ TEST: compaction happens at end of tool call, not mid-token
✓ TEST: post-compaction context contains summary + spec artifacts
✓ TEST: per-slice isolation — slice 3 has no slice 1/2 conversation
✓ COMMIT: "feat(m14): rolling compaction @70%, per-slice context isolation"
```

---

# PHASE 7 — Framework + Preview (M15–M16)

## M15 — Framework Registry + Scaffold

**Goal:** Immutable framework selection controls everything downstream.

**Update:** `apps/server/src/harness/framework/registry.ts` (already exists, expand)
**Files to create:**

- `apps/server/src/harness/scaffold/index.ts` (stub exists, implement)
- `apps/server/src/harness/scaffold/templates/` (4 framework templates)

**Framework registry must define for each of `blank|react-native|flutter|website`:**

```typescript
{
  scaffold: () => Promise<void>  // creates project skeleton
  prompts: string[]              // framework-specific L3 skills injected
  tools: string[]                // allowed tools for this framework
  preview: PreviewMode           // 'none' | 'browser' | 'device-frame'
  build: BuildStep[]             // ordered build steps
  artifacts: string[]            // file extensions that are artifacts
  devCommand: string             // command to start preview server
}
```

**Scaffold templates must create:**

- `react-native`: Expo + NativeWind + React Navigation + Zustand + React Query
- `flutter`: Flutter + Riverpod + GoRouter + Dio
- `website`: Vite + React + Tailwind v4 + TanStack Router + Zustand
- `blank`: Empty `src/` with `README.md`

**Each template must include:**

- `.caide/design-spec.json` (populated from design tokens)
- `.caide/motion-spec.json` (populated with platform defaults)
- `.caide/spec.md` (empty template)
- `.gitignore` appropriate for framework
- Package.json / pubspec.yaml with correct dependencies

**M15 Verification Gate:**

```
✓ TEST: scaffold('react-native') → creates valid Expo project structure
✓ TEST: scaffold('flutter') → creates valid Flutter project structure
✓ TEST: scaffold('website') → creates valid Vite+React project structure
✓ TEST: framework selection is immutable — cannot change after project created
✓ COMMIT: "feat(m15): framework registry with scaffold templates"
```

## M16 — Preview + Build (Trusted Workspace)

**Goal:** Every framework has a real preview. Build pipeline is end-to-end verified.

**Files to create:**

- `apps/server/src/harness/preview/index.ts`
- `apps/server/src/harness/preview/fingerprintFiles.ts`
- `apps/server/src/harness/preview/watchProjectTree.ts`
- `apps/server/src/harness/preview/buildRunner.ts`

**`fingerprintFiles.ts` must:**

- SHA256 hash of every relevant file in project
- `fingerprint(dir, extensions)` → `Map<path, hash>`
- `diff(before, after)` → `{ added, modified, deleted }`

**`watchProjectTree.ts` must:**

- 450ms debounce on file changes (not immediate — batch changes)
- Emit `artifact_updated` events for each changed file
- Stop watching when session ends

**`buildRunner.ts` must handle per framework:**

- `react-native`: `expo start --no-dev` → device frame preview URL
- `flutter`: `flutter run -d web-server` → browser preview
- `website`: `vite dev` → browser preview URL
- `blank`: "Preview not available for Blank projects" — explicit, not silent fail
- Build failures: structured error with file:line, not raw compiler output

**Preview panel in web (672px):**

- `DevicePanel` for mobile frameworks: shows iOS/Android device frame
- Browser iframe for website framework
- Empty state with explanation for blank framework

**M16 Verification Gate:**

```
✓ TEST: fingerprintFiles detects added, modified, deleted files correctly
✓ TEST: watchProjectTree debounces — 10 rapid changes = 1 artifact_updated event
✓ MANUAL: create RN project → scaffold → build → preview shows in device frame
✓ MANUAL: edit a file → preview updates within 2 seconds
✓ MANUAL: build failure → structured error shown in ChatView, not raw output
✓ COMMIT: "feat(m16): preview and build pipeline with trusted workspace"
```

---

# PHASE 8 — Human Gates + Taste (M17–M18)

## M17 — Human Gates (CheckpointCard)

**Goal:** Hard gates after design system and after first slice. Non-skippable.

**Files to create/update:**

- `apps/web/src/components/CheckpointCard.tsx` (NEW component)
- Update `ChatView.tsx` to render `CheckpointCard` on `checkpoint` events

**CheckpointCard must show:**

```
┌─────────────────────────────────────┐
│  🔍 Review Required                 │
│  [reason text]                      │
│                                     │
│  Changes:                           │
│  • [diff summary line 1]            │
│  • [diff summary line 2]            │
│                                     │
│  [View Full Diff] [Approve] [Request Change]
└─────────────────────────────────────┘
```

**Gate triggers (mandatory, cannot be skipped):**

1. After Planner creates `spec.md` and `design-spec.json` (Gate 1)
2. After first slice is verified (Gate 2)
3. Any Verifier `confidence < 0.75` (async glance queue)
4. Any Fixer failure after 3 attempts
5. Security/performance issues found by quality pass

**`Request Change` flow:**

- User types change request in text area
- Sent back to Planner or Builder as `inject` event in Inbox
- Turn resumes from appropriate stage

**M17 Verification Gate:**

```
✓ MANUAL: create project → plan card appears → must approve before building starts
✓ MANUAL: first slice done → checkpoint card appears → must approve before slice 2
✓ MANUAL: Request Change → typed change → incorporated in next turn
✓ TEST: checkpoint event → CheckpointCard renders with correct diff
✓ COMMIT: "feat(m17): human gates — CheckpointCard with diff, approve, request change"
```

## M18 — Taste Model

**Goal:** Aesthetic quality pass. Anti-slop. Motion quality. Separate from functional Verifier.

**Files to create:**

- `apps/server/src/harness/taste/index.ts` (stub exists, implement)

**Taste role must:**

- Never fix functional bugs — only aesthetic/motion/UX issues
- Run after Verifier passes (not instead of it)
- Score against these criteria:
  - Is it "jaw-dropping, award-winning" or "safe, boring, AI-generated"?
  - Are motion timings intentional (spring config set) or default?
  - Are empty states illustrated (not just text)?
  - Is typography hierarchy clear at a glance?
  - Does every touch target feel deliberate (not accidental)?
  - Is color usage restrained and purposeful?
- Output: `TasteResult { score, passed, improvements[] }`
- `score < 0.8` → send `improvements[]` to Builder for aesthetic fix pass
- `score >= 0.8` → pass, proceed

**Anti-slop checklist (every generated app must fail these or be flagged):**

- No gradient text as default polish
- No glassmorphism as default card style
- No lorem ipsum anywhere
- No placeholder images (use explicit empty states)
- No generic icon set (use specified `iconPack` from design tokens)
- No all-caps marketing copy in the UI
- No "Created with AI" watermarks or branding injected

**M18 Verification Gate:**

```
✓ TEST: generic-looking output → taste score < 0.7, improvements[] populated
✓ TEST: premium-feeling output → taste score > 0.85
✓ TEST: anti-slop checks catch gradient text, glassmorphism defaults
✓ COMMIT: "feat(m18): taste model — anti-slop, motion quality, aesthetic pass"
```

---

# PHASE 9 — Settings Rebuild (M19)

## M19 — Settings for Harness

**Goal:** Settings panels reflect the new harness. Profile stays. MCP gone for v1.

**Files to update/create:**

- `apps/web/src/components/settings/ModelsSettingsPanel.tsx` — rebuild for harness
- `apps/web/src/components/settings/ProvidersSettingsPanel.tsx` — rebuild as unified provider config
- `apps/web/src/components/settings/ProfileSettingsPanel.tsx` — keep, minimal changes

**New `ModelsSettingsPanel` must show:**

```
Model Configuration
─────────────────────
Planning model:    [dropdown: fable-5 / opus-4.8 / sonnet-5]
Building model:    [dropdown: gpt-5.6-sol / fable-5]
Verification model:[dropdown: fable-5 / opus-4.8]
Taste model:       [dropdown: opus-4.8 / fable-5]
```

**New `ProvidersSettingsPanel` must show:**

```
Provider Configuration
──────────────────────
API Base URL: [text input: https://opencode.ai/zen/v1]
API Key:      [password input] [Test Connection]

Connection status: ● Connected  (or error state)
```

**No external MCP for v1** — remove from settings entirely.
**No skills settings for v1** — built-in skills only.
**No keyboard shortcuts panel for v1** — remove.

**M19 Verification Gate:**

```
✓ MANUAL: settings → Models tab → change planning model → saved
✓ MANUAL: settings → Provider tab → enter API key → Test Connection → shows success
✓ MANUAL: Profile tab → unchanged, still works
✓ MANUAL: no MCP, no Skills, no Keyboard Shortcuts tabs
✓ COMMIT: "feat(m19): settings rebuild — harness model/provider config"
```

---

# PHASE 10 — Quality Passes (M20–M25)

## M20 — Edge Case Sweep (per slice)

**Goal:** Every slice gets systematic edge case testing before marking complete.

**Files to create:**

- `apps/server/src/harness/edge/sweep.ts`

**Edge cases to check per screen:**

- Very long text (50+ char name, 500+ char description) — does it truncate gracefully?
- Missing data (no image, no price, no description) — does it render sensibly?
- Empty collection (0 items) — correct empty state shown?
- Slow network (degraded) — loading state shown, not blank?
- Rapid repeated tap (double-tap submit) — duplicate action prevented?
- Back navigation mid-flow — state preserved or correctly reset?
- Portrait and landscape (mobile) — layout holds?

**M20 Verification Gate:**

```
✓ TEST: sweep runs for a sample screen, catches at least long-text truncation
✓ TEST: all 7 edge case checks defined and runnable
✓ COMMIT: "feat(m20): edge case sweep — systematic per-slice quality check"
```

## M21 — Adversarial Self-Play

**Goal:** Hostile user role. Tries to break the built app.

**Files to create:**

- `apps/server/src/harness/quality/adversarial.ts`

**Adversarial role must try:**

- Tapping things out of expected order
- Backing out mid-flow at every step
- Force-closing during a network call (simulate)
- Entering malformed input in every field (SQL injection, XSS strings, emoji, RTL text, max-length+1)
- Rapidly switching between tabs/screens
- Starting multiple operations simultaneously

**On finding a breakage:** Generate issue report → send to Fixer → re-verify

**M21 Verification Gate:**

```
✓ TEST: adversarial role generates at least 5 test scenarios for a sample screen
✓ TEST: a breakage found → issue report format is actionable for Fixer
✓ COMMIT: "feat(m21): adversarial self-play testing"
```

## M22 — Cross-App Coherence Pass

**Goal:** Per-slice verification can pass 20 times individually while aggregate feels inconsistent. This catches it.

**Files to create:**

- `apps/server/src/harness/quality/coherence.ts`

**Coherence checks:**

- Spacing rhythm identical screen-to-screen (measure actual pixel values from screenshots)
- Dark/light mode applied identically everywhere
- Empty state pattern identical everywhere it appears
- Loading pattern identical everywhere
- Error state pattern identical everywhere
- Navigation model consistent (no mixing tab bar with drawer)
- Icon set used consistently (no mixing phosphor-duotone with heroicons)

**M22 Verification Gate:**

```
✓ TEST: coherence check catches inconsistent spacing between two screens
✓ TEST: coherence check catches mixed icon sets
✓ COMMIT: "feat(m22): cross-app coherence pass"
```

## M23 — Security + Performance Pass

**Files to create:**

- `apps/server/src/harness/quality/security.ts`
- `apps/server/src/harness/quality/performance.ts`

**Security checks (before any preview/build):**

- No hardcoded API keys or secrets in generated code
- No `eval()` or `Function()` constructor
- No `dangerouslySetInnerHTML` without sanitization
- Input sanitization at all user input points
- No `console.log` with sensitive data
- HTTPS-only API calls (no `http://` in production code)

**Performance checks:**

- Bundle size analysis after build — flag if > 2MB initial bundle
- Image optimization — flag unoptimized images > 100KB
- List virtualization — flag unvirtualized lists with > 50 items
- React re-render check — flag components that re-render on every keystroke without memo

**M23 Verification Gate:**

```
✓ TEST: hardcoded API key in generated code → security pass catches it
✓ TEST: unvirtualized list with 200 items → performance pass flags it
✓ COMMIT: "feat(m23): security and performance quality passes"
```

## M24 — Motion as First-Class (Dedicated Role)

**Goal:** Motion is not a polish afterthought. It's a generation target from the start.

**Files to create:**

- `apps/server/src/harness/motion/index.ts` (stub exists, implement)

**Motion role must:**

- Read `.caide/motion-spec.json` (character: playful|calm|energetic|minimal)
- Generate motion for: screen transitions, element entrances, interaction feedback
- Platform-appropriate: iOS springs (stiffness:400 damping:30), Android ease-out (200ms), Web custom spring
- Haptic mapping: `impact.light` on selection, `impact.medium` on confirm, `notification.success` on completion
- `prefers-reduced-motion` alternative for every animation (0ms or semantic equivalent)
- Test: rapid repeated input — animation must interrupt cleanly, not queue

**M24 Verification Gate:**

```
✓ TEST: motion spec generated for new project has all required fields
✓ TEST: reduced-motion alternative exists for every defined animation
✓ TEST: haptic mapping covers all interaction types
✓ COMMIT: "feat(m24): motion as first-class — dedicated role, haptics, reduced-motion"
```

## M25 — Comparative Benchmark

**Goal:** Push past "meets spec" into "genuinely excellent."

**Files to create:**

- `apps/server/src/harness/quality/benchmark.ts`

**Benchmark pass must:**

- For each framework (RN, Flutter, Website), define 3 reference apps per category
- After build completes, compare against reference screenshots via Taste model
- Score: `benchmarkScore 0.0–1.0` (how does this compare to category leaders?)
- `benchmarkScore < 0.7` → specific improvement areas returned to Builder
- Track improvements across projects (does score improve over time?)

**M25 Verification Gate:**

```
✓ TEST: benchmark produces a score with specific improvement areas
✓ TEST: improvement areas are actionable (not "make it look better")
✓ COMMIT: "feat(m25): comparative benchmark vs category leaders"
```

---

# PHASE 11 — Self-Improving Loop (M26)

## M26 — Cross-Project Learning

**Goal:** The harness gets better with every project it builds.

**Files to create:**

- `apps/server/src/harness/selfImprove/index.ts` (stub exists, implement)
- `apps/server/src/harness/selfImprove/projectLog.ts`

**Self-improve loop must:**

- After every project: record `{ skills, verifierPassRate, fixerRetryCount, tasteScore, benchmarkScore, edgeCasesFound }`
- Identify patterns: which skill combos produce high Verifier pass rates?
- Identify recurring failures: if "long text truncation" breaks 3+ projects → strengthen skill file
- Identify systematic edge cases → promote to Builder default pattern
- `A/B logging`: when skill file is updated → log old vs new performance

**M26 Verification Gate:**

```
✓ TEST: project log written correctly after project completion
✓ TEST: recurring failure detection identifies a pattern across 3 mock projects
✓ COMMIT: "feat(m26): self-improving loop — cross-project learning"
```

---

# PHASE 12 — Acceptance (M27)

## M27 — Full Acceptance Suite

**Every item must pass before v1 is considered shippable.**

### Functional Acceptance

```
✓ Clean boot (no prior state) → server starts, web loads, no console errors
✓ Create Blank project → no error, no preview (correct)
✓ Create React Native project → scaffold succeeds, design-spec.json created
✓ Create Flutter project → scaffold succeeds
✓ Create Website project → scaffold succeeds, preview URL available
✓ Chat: "hey" → ask intent, no build triggered
✓ Chat: "build a todo app" → plan mode entered, spec.md gate shown
✓ Plan approval → Builder starts, tokens stream to ChatView in real time
✓ First slice checkpoint → appears, can approve or request change
✓ Request change → typed change incorporated, build continues
✓ Cancel mid-build → turn stops cleanly, no stale running process
✓ Provider failure → structured error shown with retry option
✓ 2 projects × N chats → concurrent with zero cross-talk
✓ Restart server mid-session → session resumes from JSONL, no data loss
✓ Long chat (100+ turns) → compaction triggers, continue works
✓ Framework preview working per framework type
✓ bun fmt passes
✓ bun lint passes
✓ bun typecheck passes
```

### Quality Acceptance

```
✓ Generated React Native app: taste score > 0.8
✓ Generated app: no anti-slop flags (gradient text, glassmorphism defaults)
✓ Generated app: all screens have empty/loading/error states
✓ Generated app: all tap targets >= 44px
✓ Generated app: follows design tokens exactly (Verifier passes first attempt)
✓ Generated app: motion spec followed (springs, reduced-motion alternatives)
✓ Generated app: security pass — no hardcoded secrets
✓ Generated app: benchmark score > 0.7 vs category reference apps
```

### UX Acceptance

```
✓ Profile settings: works, saves correctly
✓ Provider settings: API key + URL saves, Test Connection works
✓ Model settings: planning/building/verification/taste model changes save
✓ Theme: dark/light mode toggle works
✓ Desktop Electron: opens, connects to server, functions identically to web
```

---

# Implementation Rules for the Agent Following This Plan

## Never Break These

1. **One milestone = one commit.** Never commit half a milestone. Never leave the tree dirty.
2. **Verification gates are hard stops.** If a gate doesn't pass, fix it before proceeding. Do not mark a milestone done if any gate item is failing.
3. **UI stays.** Never delete `ChatView.tsx`, `Sidebar.tsx`, `Profile`, or any UI component without explicit instruction. Only the engine files listed in M0 are deleted.
4. **No stubs.** Every implemented file is real code. No `export const stub = true`. If you can't implement something fully, stop and report rather than stub it.
5. **Read this plan + AGENTS.md at the start of every session.** After every compaction. Every time.
6. **Commit after every milestone.** Push to `origin/feature/shell-rebuild-v2`.

## Design Non-Negotiables

- Every generated app follows `.caide/design-spec.json` exactly — no improvising tokens
- Every generated app has empty/loading/error states on every screen
- Every interactive element ≥ 44px tap target
- Every animation has a `prefers-reduced-motion` alternative
- No lorem ipsum, no placeholder data, no TODO comments in generated code
- Anti-slop is not optional — generic output is a bug

## Architecture Non-Negotiables

- `loop/` imports nothing from `agent/` — pure, testable, fake-LLM capable
- Verifier never sees Builder's reasoning trace — fresh context always
- Per-slice context isolation — slice N has no slice 1..N-1 history
- L0+L1 prompts always cached — never re-paying full token price per call
- `spec.md`, `design-spec.json`, `motion-spec.json` — always present in context, never compacted away
- JSONL session log — append-only, parentUuid chain, 100ms write queue
- Tool results pre-digested — structured `{ errorType, fileLine, likelyCause, suggestedFix }` not raw stack trace

## Reference Repos to Steal From

| Pattern                                                                | Steal From                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Stateless loop, TurnFlow, ContextMemory                                | `/home/DejiTech/dev/kimi-code/apps/kimi-code/src/`          |
| System prompt registry, Inbox, SessionEventMap                         | `/home/DejiTech/Downloads/deepseek-harness-master/cli/src/` |
| JSONL storage, defineTool, ToolScheduler, StreamingToolExecutor        | `/home/DejiTech/claude-code/` (OpenAI Codex repo)           |
| Checkpoint chain, skill packs, design engine contract, preview runtime | `/home/DejiTech/dev/personal projects/dyad x caide/src/`    |

---

## Current State When This Plan Was Written

- Branch: `feature/shell-rebuild-v2`
- Tree: clean (nothing uncommitted)
- Real harness files that exist (do NOT delete): `turn/index.ts`, `turn/runner.ts`, `loop/loop.ts`, `session/index.ts`, `provider/apiAdapter.ts`, `router/index.ts`, `framework/registry.ts`, `verifier/index.ts`, `harness/prompts/registry.ts`, `design/tokens.ts`
- Old engine still alive: `codexAppServerManager.ts`, `orchestration/`, `agentGateway/`, `checkpointing/`, `automation/`, `browserAutomation/`
- Start with M0. Strip first. Everything else depends on a clean tree.

---

_Last updated: 2026-08-30. Next milestone: M0 — Strip._
