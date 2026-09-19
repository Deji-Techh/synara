# Bugs found in review of Phase 0 + Phase 1 — fixed

Self-review of `dc739805` (Phase 0) and `cab8effd` → `e4405160` (Phase 1
M1–M6), hunk-by-hunk against V1 (`dyad x caide`) sources. Standard is V1-exact
except the approved fix-in-transit ledger (007 §6).

## A. Real bugs found and fixed

### 1. Turbo appendix default-on for build — HIGH (fixed)

M6 set `enableTurboEditsV2: chatMode === "build"`. V1's
`isTurboEditsV2Enabled` (`lib/schemas.ts:540-545`) requires an explicit
`proLazyEditsMode === "v2"` opt-in — **default off**. My change appended the
surgical-edits appendix to every build prompt, changing build behavior vs the
V1 default. Fixed: back to `false` until the 018 Turbo setting lands (which
will enable build-only, ask/plan forced off, exactly like the donor).

### 2. `add_integration` hidden on bare-URL links — MEDIUM (fixed)

M2 hid `add_integration` on any link (`hasDbLink === true`). V1's
`isEnabled` keys off project IDs (`!supabaseProjectId && !neonProjectId`,
`add_integration.ts:28`): a bare-URL link is NOT a managed connection, so V1
keeps offering integration to allow upgrading. Fixed: new tri-state
`hasManagedDbLink` (supabase needs `projectId`; neon needs `projectId` +
`branchId`), computed in `turnContext` from the link; the rule now keys off
it. Covered by managed-vs-bare test postures.

### 3. MCP search fail-open without a registry — LOW/MEDIUM (fixed)

M2 passed `mcpSearchEnabled: registry ? true : undefined`, leaving the tools
offered when no registry exists. V1 hides them when search is unavailable
(`isEnabled: !!ctx.isMcpToolSearchAvailable`, itself gated on sandbox +
setting + size threshold). Fixed: explicit `input.mcpRegistry != null`.
(Legacy callers passing nothing keep legacy behavior; no existing tests broke.)

### 4. Missing consent previews on ask-default tools — MEDIUM (fixed)

M1 plumbed previews but `run_command`, `install_package`, `build_project`,
`lint_project`, `test_project` had no `presentCall`, so their cards showed
bare args. V1 defines `getConsentPreview` for all of them (`$ <cmd>`,
`Install <pkgs>`, `Run test suite…`, `Run linter`). Fixed: `presentCall`
added in V1's exact formats (run_command mirrors the `$ cmd (in ./dir)` shape
against the V2 schema). `git_commit`/`execute_sql` already had theirs.

### 5. Deleted `rawCmd` line during preview edit — WOULD-BE CRITICAL (caught instantly)

While adding the run_command preview I dropped the `const rawCmd = ...` line
the executor depends on. Caught on immediate re-read, restored, and verified
by reading the region plus tests. No commit ever contained it.

### 6. Dynamic import for the scaffold marker — LOW (cleaned)

`scaffoldProject` used `await import(blueprintStore)`; the store imports only
node builtins, so no cycle is possible. Replaced with a static import.

## B. Investigated and CLEARED (no bug — evidence)

- **`supabaseConnected: false` passed explicitly (M5).** `buildProviderInvariants`
  only emits when `hasSupabaseProject`/`hasNeonProject` is true; all-false emits
  nothing. The disconnected notice fires solely for has=true + connected=false,
  a combination the wiring never produces. V1's outer call feeds the same pair.
- **`execute_sql` / `get_database_table_schema` shown on bare-URL links.**
  V1-exact ID gating would HIDE tools that work in V2 (URL-based execution via
  `resolveDatabaseUrl`, incl. `.env` fallback). Hiding them regresses working
  flows; the execute-time `DbNotConnectedError` guidance is the backstop, exactly
  like V1's execute-time precondition throw. Deliberate adaptation, documented.
- **Info tools shown on provider match without projectId.** V2 implementations
  work bare-URL (they list the ID when present, error clearly when truly
  unlinked). Same rationale as above.
- **Ask passes full prompt context, not V1's sparse 6 opts.** V1's ask
  reconstruction (`chat_stream_handlers.ts:1539-1547`) predates the options the
  agent constructor later gained — stale-call drift, not intent (withholding DB
  invariants from DB questions is broken behavior). Full context is strictly
  more correct; recorded as an improvement.
- **H5 kills owned subagents on cancel; V1 left orphans.** Deliberate: V2's
  subagent system is a superset with `cancel_agent`, the 90s seal, and
  `wait_agents`; turn-cancel means stop everything. Approved in the 008 plan.
- **30-min consent deadlines; V1 had none.** 007 §6.4 mandate — unbounded park
  is the bug being fixed, not behavior to preserve.
- **Stray-cancel synthetic `turn_end`.** Matches V1, whose cancel handler warns
  but still emits end events with no active stream.
- **H1 signal chain.** Verified end-to-end: turn controller → loop → tool
  `context.signal` → consent wait; subagent spawn links parent abort; sandbox
  captures its execution signal.
- **`onInterrupt` throw path.** Single caller (`onInterruptFromStopControl`),
  which catches and toasts. No unhandled-rejection surface.
- **`freeModelMode` omitted from ask.** Never true anywhere (de-Pro'd); output
  identical with or without it.
- **`themePrompt` omitted from ask.** V1 passes it, but V2 has no themePrompt
  source yet (014 owns it) — identical to V1-with-no-theme.
- **`codeExplorerAvailable` omitted.** Same: no V2 readiness source until 016;
  identical to V1-when-unavailable.

## C. Verification for this review round

- Server typecheck: 759 errors before = 759 after (normalized full-set diff;
  all pre-existing `exactOptionalPropertyTypes` drift + missing modules).
- Web typecheck: 311 = 311, proven via an isolated `git worktree` baseline at
  `07f85eaa` (the earlier in-tree comparison was invalidated by a stash
  accident — see D; redone properly).
- Suites: turnContext/gateway/runner/loop/uiBridge/tools/mcp/sandbox/plan/
  prompts/scaffold green, including the new managed-vs-bare, marker, 3q, and
  cancel-clears-blueprint tests. The single `prompts.test.ts` narration failure
  and the video/contracts errors are pre-existing at HEAD.
- `oxfmt --check` clean on every touched file; unrelated whole-tree reflows
  reverted in favor of surgical hunks.

## D. Process incidents (so they don't repeat)

- **Blind `git stash pop` applied a foreign pre-existing stash**
  (`feature/backend-transplant`, `ProjectPicker.tsx`) into the tree as a
  conflict. Restored via `git restore --source=HEAD`, stash entries left
  untouched. Rule: never pop without `git stash list` before/after; prefer
  `git worktree` for baselines (as done for the web check above).
- **`bun fmt` reformats ~280 drifted files repo-wide.** Always revert
  non-intended files before committing; check formatting per touched file.
- Bare `turbo` is not on PATH in non-interactive shells — always via `bun run`.

## E. Known gaps remaining (owners, not bugs)

016: `codeExplorerAvailable` wiring + explorer readiness. 014: `themePrompt`,
`appSkillPack`, theme generator. 018: `testingEnabled`, `appTarget`,
Turbo/master/blueprint/sandbox toggles, full-access default flip. 013:
client-code snippets, Neon email-verification feed. Later milestone: build
XML-tag pipeline, post-turn pipeline stages. Pre-existing red: video,
contracts, one prompts narration test.
