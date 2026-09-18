# 010 — Persistence: threads, versions, memory, compaction, goals engine

## 0. Goal

V1's durability, behind V2 transport: relational threads, rich versions, memory,
compaction with V1 semantics, autonomous goals. JSONL session logs stay as the
harness transport journal; the DB is the source of truth for history.

## 1. Threads & messages (relational CRUD)

- Port `apps/chats/messages` schema + `chat_handlers` CRUD: `createChat/forkChat/
getChat/getChats/deleteChat/searchChats/deleteMessages` with cascade.
- Message fidelity: `approvalState`, `sourceCommitHash/commitHash`, `model`,
  `maxTokensUsed`, `aiMessagesJson` envelope, `isCompactionSummary`,
  early `requestId` capture.
- Harness `steer`/`turn_start/token/tool_call` projection into the transcript stays;
  `turn_end/stage/checkpoint/compaction/usage` project per V1 end-envelope needs.
- `revertVersion` message-pruning parity (with `checkoutVersion` branch semantics §3).

## 2. Chain building & compaction (V1 semantics)

- Chain: ID-based post-compaction slice incl. triggering user msg, excl. older
  summaries (keep `coveredThroughSeq` as the durable boundary; fix the
  second-precision `createdAt` trap V1 documented).
- Threshold: `min(userCap, providerCap, window−25k)`; caps google 190k / (V1-correct
  others); default 256k stays. **Trigger on measured `totalTokens ≥ threshold`**,
  not the 0.7-estimate. Mid-turn `prepareStep` compaction + compaction index-delta
  fixups ported (008).
- Execution: `pendingCompaction` flag, pre-turn + mid-turn `performCompaction`,
  summary `createdAt`-before-user invariant (or seq-equivalent, documented),
  `chat:compaction:complete` event parity, manual Compact-now (keep V2, refuses live).
- Backup transcript: keep V2 dir/prefix/gitignore/keep-5; adopt V1's
  `<tool-use>/<tool-result>` transform + truncation.
- Compaction system prompt: adopt V1's exact 5-section schema (007 §6.13 note —
  the "verbatim" header on the divergent copy must be corrected either way).

## 3. Versions / checkpoints

- Richness port: `isFavorite/note`, `getVersionChanges` (1MB + binary guards,
  concurrency 10), `checkoutVersion` (branch + Neon preview/dev switch),
  `revertVersion` (revert-commit + message prune + Neon point-in-time restore +
  Supabase redeploy), retention-window warnings.
- Auto-checkpoint per mutating turn (keep V2) + V1 metadata join
  (`hash/message/createdAt/files` + favorite/note/neonDbTimestamp over WS).
- UI home: git-pane History section (017).

## 4. Memory

- Keep V2's `readAiRules` + `.caide/APP_MEMORY.md` + `decisions.jsonl` (superset),
  enforce the caps (500-char clamp, 2000-char prompt cap), wire formatting into
  every turn. V1's "edit AI_RULES.md only when asked to remember" rule stays
  in the prompt.

## 5. Goals engine (autonomy restored, server-side) — CLOSED (see 007 §8 A2/A3)

- Port `update_goal_state` (full-state replace), `capture_evidence` WITH
  `goalId/taskId`/kind-enum/revision gating (re-couple evidence→predicate),
  `run_tests`/`run_lint` (naming confirmed: donor `goal_verification.ts`
  names keep; coexist with framework-aware `test_project`/`lint_project`).
  Single `capture_evidence` def only (`dyad/goals`).
- Scheduler: interval driver + `recoverExpiredRuns` + `nextRetryAt` persistence +
  wake-on-mutation + retryable-blocker probing + stall detection (no Electron tray;
  lifetime = server). Failure/run ledger ("M4" debt) ships here, not later.
  → Shipped: `dyad/goals/goalScheduler.ts` (ledger + backoff + 8-run block +
  30m lease recovery + probing + stall + 10s driver + wake + outbox/sink),
  registered per-turn in `harness/turn/runner.ts`, lifetime in `effectServer.ts`.
  WS event type + toast rendering ride Phase 6 (015/017) via `drainGoalEvents()`.
- Notifications via WS events (015 renders them): goal completed/failed,
  input-needed. No silent goals.
- Questionnaire 5q→3q alignment lives in 008; prompt text promising
  auto-continuation must be TRUE after this plan (or edited).

## 6. Streaming & cancel envelopes

- End envelope carries V1 fidelity: `updatedFiles`, `wasCancelled`,
  `pausePromptQueue`, `totalTokens`, `contextWindow`.
- `chat:cancel(chatId)→bool` semantics on the harness cancel (abort resolvers,
  partial-response save, consent/MCP/user-input decline-settle) — with 008's
  backstop + delivery fixes.

## 7. Acceptance

- Fork/search/delete-messages/cascade all work on the harness path; reload-safe.
- Compaction triggers on measured tokens with V1 caps; backup readable; boundary
  survives restart.
- Versions: favorite/note/diff/checkout/revert (+DB restore paths) e2e.
- Goal advances autonomously on its timer, recovers after restart, notifies.
- Cancel during compaction/version-ops settles cleanly.
