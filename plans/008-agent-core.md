# 008 — Agent core: turn engine, modes, consent, tool loop, cancel

## 0. Goal

V1's turn flow (`chat_stream_handlers` + `local_agent_handler`) is the gold standard.
Port it faithfully behind the frozen V2 transport (007 §2), with the fix-in-transit
items (007 §6.1–10). Phase 0 (cancel + safety) ships first — everything else queues behind it.

## 1. Phase 0 — unstick the product (blocking)

V1 refs: `src/ipc/handlers/chat_stream_handlers.ts:2273-2298` (`chat:cancel` → abort +
`wasCancelled:end`), `tool_definitions.ts:211-219` (abort clears consents).

1. **H1 — signal into delegated consent.** Pass the turn `AbortSignal` to
   `requireAgentToolConsent` in `subagentLoop.ts:79-115` and to
   `requireMcpToolConsent` in `sandboxTools.ts:117-129`. Add deadlines to
   `waitForConsent`/`waitForMcpConsent` (007 §6.4). Park-before-signal race:
   `withdrawSessionPrompts` must also settle waiters registered within the same tick.
2. **H2 — terminal backstop.** `onCancel` (`gateway.ts:260-267`) broadcasts synthetic
   `turn_end {status:"cancelled"}` (same shape as `cancelTurn`). Unify Stop paths:
   `ChatView onInterrupt` sends harness-cancel + `clearLiveTurn` (no api-gated
   early-return); `Sidebar handleInterruptThread` sends harness-cancel too.
3. **H3 — cancel delivery.** Ack or queue+retry cancel sends in `harnessWs.ts`
   (cancel is fire-and-forget today; prompts have replay, cancels need it more).
4. **H5 — owned subagents.** `runner.cancel` calls `requestSubagentCancel` for
   session-owned subagents; close the controller delete→re-register failover gap.
5. **Safety P0s.** Shell blocklist restored as pre-consent refusal (007 §6.6);
   ask-mode `readOnly` threaded (007 §6.7); full-access → explicit opt-in, default
   `approval-required` (018).
- **Acceptance:** live stuck-turn repro (parked consent + parked questionnaire +
  half-open socket) cancels within 2s, Stop unlatches, `turn_end/cancelled` observed.

## 2. Turn engine transplant

Port V1 `local_agent_handler.ts` flow as `apps/server/src/dyad/agent/turnEngine.ts`
(or equivalent), keeping V1's exact order:

- Handler branches per mode (ask `readOnly:true`, plan `planModeOnly:true`, agent full,
  build XML-tag path — §3). `resolveChatModeForTurn` stored/requested/default with
  provider-aware default (`local-agent` iff provider ready else `build`); legacy
  `agent→build` migration. Single `chatModeFor` adapter at the layer boundary —
  no second mode schema.
- Budgets: agent 100 (`settings.maxToolCallSteps ?? 100`), build `stepCountIs(20)`.
- `stopWhen`: step count, `add_integration`, `write_app_blueprint` (success-only stop),
  plan-mode `write_plan`/`exit_plan`.
- `prepareStep`: pairing repair + pending-user injection + tool-result ordering
  (V1 `prepareStepMessages`/`ensureToolResultOrdering`, incl. compaction index-delta).
- Terminated-step retry with continuation instruction; weak-model text recovery.
- Post-turn pipeline per mode: UI-quality pass (agent only), checkpoint chain
  decision (017/016 — port or record), Supabase deploy-if-needed, `aiMessagesJson`
  save, git commit + `commitHash` + Neon timestamp (agent only), `approvalState`,
  attachment warning, step-limit notice, todo follow-up (max 1,
  `!readOnly && !planModeOnly && passEndedWithText && hasIncompleteTodos`).
- Cancel/error: abort clears consents/MCP/questionnaire/integration/blueprint
  (V1 `1316-1324,1900-1911`); partial-response save; `wasCancelled` end envelope.
- `chat:response:ack`-style backpressure if the transport needs it (010).

## 3. Modes matrix (behavioral parity, not just prompts)

| Mode | Handler | Prompt | Tools |
|---|---|---|---|
| build | `simpleStreamText` + XML pipeline: `<caide-write>/<dyad-search-replace>` emit → dry-run repair (2 attempts) → unclosed-write continuation (2) → `processFullResponseActions` or proposal approve/reject | `BUILD_SYSTEM_PREFIX/POSTFIX` + turbo (iff enabled) + Nitro nudge (vite-only) + test guidance | Zero native tools (MCP-agent detour only iff `enableMcpServersForBuildMode`) |
| agent | `handleLocalAgentStream`, native tool calls | `constructLocalAgentPrompt` (Pro vs basic) | Full set minus plan-only, minus `never`, minus `isEnabled`-false, minus deferred |
| ask | `handleLocalAgentStream {readOnly:true}` | `LOCAL_AGENT_ASK_SYSTEM_PROMPT` (NOT legacy ASK prompt) | Non-modifying only; sandbox-write host off; MCP direct off; no deploy/commit; `updatedFiles:false`; `stripDyadTags` in history |
| plan | `handleLocalAgentStream {planModeOnly:true}` | `constructPlanModePrompt` | Non-modifying + `write_plan`/`exit_plan`/`planning_questionnaire` only |
| doctor | Not a chat mode in V1 (repair-dispatch action) | — | Keep V2 `DoctorDialog` + `/doctor`; do not invent a mode |

- Turbo-edits: build-only (ask/plan force false; agent constructor ignores).
- Build proposal flow: `autoApproveChanges` vs approve/reject; ask throws on approve.
- Step-limit: `<dyad-step-limit>` notice + `pausePromptQueue` semantics on the V2 event.
- V1 `ChatModeSelector` "Build" is distinct — remove V2's "Legacy alias for Agent" label.

## 4. Tool registry + consent

- Port `TOOL_DEFINITIONS` + `shouldIncludeTool` precedence verbatim:
  `never`→out; plan filters; `freeModelMode/usesEngineEndpoint`→dropped per de-Pro
  (keep the branch shape, force free); blueprint off→out; `readOnly`→drop mutating;
  deferred unless requested; **`isEnabled(ctx)` restored** (execute_sql w/o DB link,
  supabase/neon info w/o project, add_integration when connected, sandbox on
  unsupported platform, MCP search outside search mode, explorer/LSP unavailable).
- Consent: `always/never/SQL-autoApprove` verbatim; per-call preview + SQL metadata
  plumbed (`getConsentPreview/getConsentMetadata` → cards); danger forces ask +
  suppresses always-allow (V1's dropped-`dangerInfo` seam fixed: wire it through).
- `CAPABILITY_GATED_BLUEPRINT_TOOLS` enforced (not `void`); sandbox `write_file`
  host capability-gated by blueprint approval.
- `stopAfterTool` wiring passes the V1 tool names from the runner.
- MCP consent race (human-wins, fail-closed) + classifier default-off + spinner/reason.

## 5. Questionnaire / plan tools / blueprint

- `planning_questionnaire` 1–3 Q / 1–3 options (+ `why` field kept), resolvers,
  malformed-reflection injection, 5-min deadline, dismiss/timeout strings.
- `write_plan` (`plan:update` + disk draft) / `exit_plan` (`confirmation` guard,
  clears blueprint requirement, `plan:exit` routing — 017 handoff spec).
- Blueprint: arm at app creation, `assertAppBlueprintApproved` at execution,
  delete on cancel; `stopWhen(write_app_blueprint)` all agent turns.

## 6. Runner wiring (kills the 4-of-13 gap)

`runner.ts` passes the full option set: `frameworkType` (restore `detectFrameworkType`
or formally retire consumers), Supabase/Neon state, `testingEnabled`, `themePrompt`,
`appSkillPack` (wire project skills, 014), `enableAppBlueprint`, `codeExplorerAvailable`
(016), `enableTurboEditsV2` per mode (§3), `readOnly` for ask.

## 7. Acceptance

- Modes matrix e2e: ask offers zero mutating tools; build emits XML tags and applies
  via action pipeline; plan ends at `write_plan`/`exit_plan`; agent full loop.
- Consent cards show V1 previews; `never` never prompts; danger blocks always-allow.
- Cancel acceptance (§1) + no `waitsForUserInput` 600s zombie (exempt from budget
  ONLY while abort + deadline both armed).
- Ported V1 unit tests for handler/consent/tool-filter travel with the code.
- Commit: `008 agent core (phase 0: cancel+safety)` then `008 agent core (modes/tools/consent)`.
