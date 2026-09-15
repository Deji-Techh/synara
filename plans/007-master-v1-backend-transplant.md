# 007 — MASTER: V1 backend / V2 UI transplant

## 0. Mission (user-locked, do not renegotiate)

- **Interface = V2, pixel-exact.** `apps/web/src` is the only UI. Zero V1 visuals.
- **Everything non-UI = V1, faithful.** The agent, the turn flow, tools, prompts,
  providers, workers, services, DB, scaffolds, packaging from
  `/home/DejiTech/dev/personal projects/dyad x caide` (V1) are ported into this repo.
  V1's agent flow is the gold standard — preserve it exactly, minus the bugs in §6.
- **Everything free.** No Pro, no gateway, no quota. Ported features work with user keys.
- **English only.** No i18n (V1's 4-language bundles are not ported).
- **Fix in transit.** V1 bugs are ported only as fixed versions (§6 ledger).

V1 = `/home/DejiTech/dev/personal projects/dyad x caide`.
V2 = this repo. Donor `/home/DejiTech/dev/dyad` is reference-only (ambiguities, never behavior).

## 1. Boundary: bring in / delete / replace / improve

### BRING IN (V1 → `apps/server/src/dyad/**`, Electron-only bits → `apps/desktop`)

| V1 source | Lands in | Plan |
|---|---|---|
| `src/pro/main/ipc/handlers/local_agent/` (handler, tools, consent, MCP) + `src/ipc/handlers/chat_stream_handlers.ts` turn flow | `dyad/agent/` (new) behind harness protocol | 008 |
| `src/prompts/` (all constructors, skill packs, loader, guides) | `dyad/prompts/` (replace partials) | 008 |
| Providers: `language_model_constants`, `get_model_client`, `remote_language_model_catalog`, `opencode_zen_models`, ChatGPT auth, custom provider/model handlers | `dyad/providers/` | 009 |
| `src/db/` + `drizzle/` (threads, messages, versions, goals, MCP, collections, language models) + compaction/memory/goal-scheduler | `dyad/store/` + `persistence/Migrations` | 010 |
| Preview: `worker/proxy_server.js` + injected clients, `preview_tunnel_service`, `public_preview_service`, console/problems/tests/security/configure, visual editing, DeviceLab, Capacitor + managed toolchain, ReleaseCentre | `dyad/preview/` + `apps/desktop` (toolchain) | 011 |
| GitHub/Vercel handlers, `vercel_neon_sync`, CAIDEPKG package service, remote share, collaboration + preview sessions (server code already vendored — wire client) | `dyad/publish/`, `dyad/share/`, `dyad/collab/` | 012 |
| MCP handlers/manager/OAuth/consent, Supabase + Neon full lifecycles, `add_integration` | `dyad/mcp/`, `dyad/db/` (extend) | 013 |
| Skills/prompts CRUD, context pickers, media mentions, queue/tabs/versions UI-state backends, image-gen backend, theme-gen (user-keyed), help bot (user-keyed) | `dyad/knowledge/` + 017 homes | 014 |
| Deep-link router (7 routes), file dialogs, safeStorage recovery, first-run, notification events | `apps/desktop` | 015 |
| Services (`app_runtime`, `git_service`, `isolated_test_db`, `collaboration_service`, `provider_api_key_validation`), code-explorer + tsc workers, explore/code-search/LSP tools, scaffolds, release scripts | `dyad/services/`, `dyad/workers/`, `dyad/scaffolds/` | 016 |

### DELETE (never port)

- All V1 UI: `src/components/`, `src/pages/`, `src/routes/`, renderer atoms/hooks,
  `src/i18n/` (en/es/pt-BR/zh-CN), `DyadMarkdownParser` + `Dyad*` cards, notch renderer.
- V1 Pro cloud: engine gateway (`DYAD_ENGINE_URL`), `/free` quota, `free-pro` model,
  Dyad-Pro OAuth, PostHog telemetry, `helpchat.dyad.sh` hard-code (re-point, 014).
- Eval harness (`vitest.eval.config.ts`, `__tests__/evals`, benchmarks), 119
  Playwright e2e (replaced by focused e2e, 016), `prune.js`, `tools/add-macos-cert.sh`
  (fold into release scripts if needed).
- V2 partials superseded by faithful ports (they caused today's divergences):
  `dyad/prompts` stub constructors stay only as tested; loop/runner flow logic yields to
  the V1 flow engine (008). V2 transport (`harness/ws`, `wsRpc`, stores) stays.

### REPLACE (V2 behavior → V1 behavior)

- Modes: real build-XML path, read-only ask, plan gating (008).
- Consent defaults: V1 ask-first; full-access becomes explicit opt-in (default
  approval-required). MCP auto-approve default-off.
- Static model catalog → live catalog + aliases + Zen free list (009).
- Local-grant-only sharing → full share plane (012).
- ChatGPT plan-auth: ported as provider auth (009), not dropped.

### IMPROVE — fix-in-transit ledger (§6)

## 2. Transport law (architecture)

- V2 protocol is frozen: `/harness` WS events, orchestration RPC, `database.invoke`,
  `HarnessReveals`, `HarnessPrompts` cards. V1 logic is implemented BEHIND it.
- Never rewire V2 UI to V1 IPC shapes. Never reshape V2 UI to V1 visuals.
- V1's `safeSend("chat:stream:*")` streaming becomes harness `token`/`turn_end`
  envelopes with V1's end-envelope fidelity (`wasCancelled`, totalTokens — 010).
- Electron-main-only V1 code (safeStorage, tray, deep-links, utilityProcess,
  node-pty) lives in `apps/desktop`, exposed to the server via the existing
  `desktop:*` channel pattern or local WS — never imported by `apps/server` directly.

## 3. De-Pro policy (everything free)

| V1 Pro mechanism | Free equivalent |
|---|---|
| Engine gateway + `usesEngineEndpoint` tools | Direct provider calls with user keys; `basicAgentMode`/`PRO_AGENT_ONLY` stay no-ops |
| `free-pro` / free-agent quota / `/free` quota | Deleted. No limits anywhere |
| `autoApproveSafeMcpTools` Pro+free gate | Plain user setting, default off |
| Pro-gated web tools, lazy edits, smart context | User settings (018), work with user keys |
| Theme-generator / help-bot catalog aliases | Resolved against user-keyed models (009/014) |
| Annotator `AnnotatorOnlyForPro`, `ProBanner`, quota banners | Dropped (were stubs or paywalls) |
| ChatGPT device-flow auth | Ported (account auth, not Pro) |

## 4. Phase order (commit after each milestone)

- **Phase 0 — Unstick the product (008 §§cancel+safety).** Cancel chain H1–H5 fixes,
  shell blocklist, ask-`readOnly` threading, full-access opt-in. Nothing else is
  verifiable while turns wedge. Live stuck-turn repro must pass.
- **Phase 1 — Agent core (008).** Modes matrix, tool registry + `isEnabled`, consent
  + deadlines, questionnaire 3q, blueprint semantics, post-turn pipeline, budgets.
- **Phase 2 — Providers + persistence (009, 010).**
- **Phase 3 — Preview + publish/share (011, 012).**
- **Phase 4 — MCP/integrations + knowledge/chatpower (013, 014).**
- **Phase 5 — Shell + services/workers/scaffolds (015, 016).**
- **Phase 6 — UI homes (017) + settings reconciliation (018).** Interleaved per
  milestone as surfaces land, finalized here.
- **Phase 7 — Full build, focused e2e, AppImage** (`CAIDE_DESKTOP_TMPDIR=/tmp/caide-stage`).

Parallel agents may work different domain plans; 008 Phase 0 first — all else queues behind it.

## 5. Verification per milestone

`bun fmt` + `bun lint` + `bun typecheck` as ONE bundled pass, then `bun run test`
(never `bun test`). Ported V1 unit tests travel with their modules (016). Commit:
`git status`, `git diff`, `git log --oneline -5`; stage only intended files; no secrets;
no AI co-authorship.

## 6. Fix-in-transit ledger (port only the fixed version)

1. **Cancel H1:** abort signal into subagent-background + sandbox-host consent paths
   (currently signal-less → infinite park, no `turn_end`).
2. **Cancel H2:** `onCancel` broadcasts synthetic `turn_end/cancelled`; unify all three
   Stop paths (composer/sidebar/session) to harness-cancel + `clearLiveTurn`.
3. **Cancel H3:** cancel sends get ack/retry (no silent drop on half-open socket).
4. **Cancel H4:** every human wait keeps its deadline AND abort; consent waits gain
   deadlines (V1 had none — unbounded park is a bug, not behavior).
5. **Cancel H5:** `runner.cancel` cancels owned subagents; close controller/failover race.
6. **Safety:** restore shell blocklist (`rm -rf /`, fork bombs, `curl|bash`, …) as
   pre-consent refusal, including under full-access; `malicious_package` keeps hard-throw.
7. **Ask mode:** thread `readOnly` (tool filter + sandbox-write host + MCP + no
   deploy/commit/`updatedFiles`).
8. **Runner wiring:** pass all prompt options (framework, Supabase/Neon state,
   testing, theme, `appSkillPack`, blueprint, explorer) — no dead constructor branches.
9. **Questionnaire:** 1–3 questions / 1–3 options (V1 contract; V2's 5q is drift).
10. **Blueprint:** arm at app creation, delete on cancel (no stale approvals).
11. **Naming:** `OLLAMA_HOST` alias for `OLLAMA_BASE_URL`; canonical `GEMINI_API_KEY`
    (V1 `.env.example` said `GOOGLE_API_KEY`, code read `GEMINI_API_KEY`).
12. **MCP classifier:** default-off; `classifierPending` + reason surfaced on the card.
13. **Compaction:** threshold `min(cap, window−25k)`, provider caps (google 190k),
    trigger on measured `totalTokens`, keep `coveredThroughSeq` boundary.
14. **V1 prompt/contract quirks fixed:** security-finding tag `<dyad-security-finding>`
    (parser contract wins); SQL danger keeps V1 `DELETE FROM <tbl> (;)` semantics;
    `GRANT ALL` stays narrow.

## 7. Wont-port ledger (explicit, do not re-litigate)

Pro/quota/gateway stack (§3) · i18n (4 langs) · evals/benchmarks/119-e2e ·
`PromoMessage`/`FreeAgentQuotaBanner`/`ProBanner` (V1 self-disabled stubs) ·
templates catalog (superseded by immutable Blank/RN/Flutter/Website) ·
release-notes iframe (superseded by WhatsNew surface) · V1 orb-halo streaming style ·
`prune.js` · Cloudflare deploy (absent in both) · notch IPC (drop unless spec'd) ·
deb/rpm packaging (dmg/nsis/AppImage only) · global OS shortcuts (neither had them).
