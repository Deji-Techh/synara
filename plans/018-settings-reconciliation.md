# 018 — Settings reconciliation: add / remove / replace + sync map

## 0. Authority

This plan is authoritative for every settings change. V2 taxonomy
(`settingsNavigation.ts`): General · Profile · Appearance · Notifications ·
Chat behavior · Keybindings · MCP servers · Database · Agent providers ·
Agent skills · Managed worktrees · System tools · Archived threads.
Design primitives: `SettingsPanelPrimitives.tsx`. Sync transport:
`syncHarnessSettings` (`harnessWs.ts:360-434`) → `sessionStores.ts` defaults
(`:116-139`) + snapshot/restore (`:227-371`).

## 1. ADD (V1 backend needs them)

**General:** Default chat mode (Build/Agent/Ask/Plan) · Default template ·
Build target (mobile/web → framework default) · Apps folder · global instructions
(optional; keep per-project too).
**Agent providers:** Default model (provider+model, thread-default inheritance) ·
Reasoning effort (Low/Med/High) · Turbo edits (Off/Classic/Search&replace) ·
Smart context (Off/Balanced/Deep) · Web access toggle · provider rows for
OpenAI/Anthropic/Google/deepseek/ChatGPT-OAuth/Azure-`resourceName`/
Vertex-triple · custom providers (server CRUD) · bundled-engine toggle (documents
absence — always direct).
**Chat behavior:** Max chat turns (Economy/Default-3/Plus/High/Max) · Max tool
calls (25/50/100/200 → `settings_sync` + `sessionStores`) · auto-approve master ·
auto-fix problems · blueprint toggle · unsafe-package gate · sandbox execution
(re-gates tool search) · MCP-in-build-mode gate (after modes land) · MCP tool
search · code explorer · Supabase write-migration + prune switches · preview prefs
(auto-expand, keep-running, device+orientation defaults).
**Database:** Supabase org OAuth + Neon token auth · branch/env/Auth sections (013).
**Connections (new group or Database extension):** GitHub OAuth · Vercel token+
project · Figma PAT.
**Notifications:** chat response/questionnaire native alerts (015 delivery).
**Appearance:** Language selector (English-only catalog — single-option row
documents the decision; loaders for other locales stay deleted).
**System tools:** Updates (channel stable/beta + auto-update) · Runtime
(Local/Docker/Cloud + experiment gate) · Node runtime (system/managed, custom
path, auto-install off) · Danger Zone full reset (confirm) · pnpm warning toggle.

## 2. REMOVE / REPLACE (contradict V1 backend or policy)

- `runtimeMode` default `'full-access'` (migrations 004/006/010) → default
  `approval-required`; full-access = explicit per-turn opt-in (008).
- `mcpAutoApproveSafe` default `true` → `false` (V1 unset/off).
- Custom models in browser localStorage → server CRUD (009); engine-invisible
  models are a bug.
- "Build = Legacy alias for Agent" label → real Build mode (008).
- Per-step scout/builder/planner + fallback chain: KEEP UI, wire to ported model
  resolution (009) — additive, not contradictory.
- `compactionEnabled` read/write vs missing interface field (`sessionStores.ts`)
  — fix the type drift while extending sync.
- Telemetry rows: none (dropped). `enableDyadPro`: none (no engine).
- Deprecated V1 fields (`enableProSaverMode`, `dyadProBudget`, old `runtimeMode`,
  `enableChatCompletionNotifications`, StoredChatMode `"agent"`,
  `proSmartContextOption "conservative"`): migrate-and-drop, no UI.

## 3. KEEP (V2-new, compatible)

Compaction section (+threshold/Compact-now/status) · ToolApprovals (14 ask-defaults
+ safe-SQL, default true) · per-project MCP/DB overlays · Agent skills catalog +
AddSkill · image-generation source/override · blockchain RPC networks · profile/
stats · keybindings · worktree/archive management · provider visibility/order ·
appearance system (palettes/density/fonts — do not regress to V1 themes) ·
per-turn thinking/fast knobs (gain Settings defaults from §1).

## 4. Sync map (extend `syncHarnessSettings` + `sessionStores`)

Must sync (currently missing): chat modes, selected/default model, thinking,
max turns/steps, Turbo/Smart/WebSearch, template, appTarget, auto-approve master,
auto-fix, blueprint, preview prefs, runtime/node, updates/channel, GitHub/Vercel/
Figma, Azure/Vertex/ChatGPT keys. Two channels stay split by design (provider keys
via secrets-file/turn-settings, everything else via `settings_sync`) — document
the split in the sync function header so they can't drift.

## 5. Acceptance

- Every §1 row exists in its target section, persists, survives restart, and
  reaches the turn (sync map covered — spot-check each family).
- §2 replacements verified (defaults off, no local-only models, Build distinct).
- Settings search index + deep-link targets updated for all new rows.
