# Plan 003 — Slim Core Prompt + On-Demand Skill Routing

Status: DRAFT (plan mode — no code changes)
Owner: prompt-slim initiative
Related: `plans/001-dyad-backend-rebuild.md` (active), audit of `bouncy-koala` (calculator, 30 min over-engineer)
Date: 2026-08-27

## 0. TL;DR

Strip ~30k tokens of always-on prompt injection down to ~3–4k. Move
`DESIGN_ENGINE_CONTRACT` + `ui-ux-mastery` (2380 lines) + companion skills +
platform-contract long prose into **on-demand skills** loaded via
`read_ui_reference` / `read_guide` / `execute_fork_skill`.

Core prompt becomes: role + 5 hard constraints + platform-contract _checklist_
(7 bullets, 120 words) + `read_ui_reference` index + tool-use rules + workflow.
Everything else is fetched only after the system classifies the task.

System (not model) decides: does this app need tabs? → read `platform-patterns`
skill. Does this change need a design-spec? → read `design-spec` template.
UI review happens **once**, after the agent declares completion — not per file.

Expected outcome: calculator goes from 100 tool steps / 3 compactions / 162KB
transcript → ~12 tool steps / 1 compaction / ~2 min wall time.

---

## 1. Problem Statement

`bouncy-koala` requested: “build a fully functional calculator application, ios style”.
Result: correct calculator (~923 lines across 7 files), but:

- Core prompt always injected `CAIDE_MOBILE_UI_SKILL_PACK` (`apps/engine/src/prompts/mobile_ui_skill_pack.ts:43`): `DESIGN_ENGINE_CONTRACT` (259 lines, 6-stage pipeline, quality gates ≥94/94/92/95/98, 3 review passes) + full `ui-ux-mastery/SKILL.md:1` (2380 lines) + `motion-interaction`, `product-flow`, `backend-production`, `anti-ai-slop` — ~25–35k input tokens per turn.
- `MOBILE_PRODUCT_CONTRACT` (`apps/engine/src/prompts/platform_contracts.ts:12`) forces bottom tab bar (≥2 tabs) and 5-viewport verification even for single-screen utilities — added `HistoryScreen` (168 lines) + `HistoryToken` not requested.
- `DEFAULT_MAX_TOOL_CALL_STEPS = 100` (`apps/engine/src/constants/settings_constants.ts:2`) + `SUBAGENT_MAX_TOOL_CALLS = 50` (`tools/explore_code_subagent.ts:61`) permits 100 sequential writes for a task needing 7.
- `tool_definitions.ts:565` `assertAppBlueprintApproved` blocks any `write_file` until `write_app_blueprint` + user approval — one extra LLM turn + human wait for a 5-word prompt.
- System generated `design-spec.json` + `motion-spec.json` + `ui-audit/latest-report.json` (162KB compaction, 83 `caide-write`) and rewrote `theme.js` 3× to satisfy linter, not user need.

This is not isolated — every trivial app pays the same tax.

---

## 2. Goals

1. Core prompt ≤4k tokens for trivial tasks; full skill only when needed.
2. Skill routing is explicit: `ui` ≠ `ux` ≠ `backend` ≠ `review` ≠ `tabs`.
3. System-classified conditional injection: tabs, design-spec, review are **opt-in** based on task + framework, not always-on.
4. UI review runs once, at end, via a dedicated review skill/tool — not per-file.
5. Calculator-class tasks complete in ≤15 tool calls and ≤3 min.

## 3. Non-Goals

- Rewrite business logic of `local_agent_handler.ts` turn lifecycle.
- Change framework registry (`blank`/`react-native`/`flutter`/`website`).
- Migrate existing conversations.

---

## 4. Current State (Measured)

| File                                                                       | Tokens (approx)                        | Always-on?                  | Needed for calculator?   |
| -------------------------------------------------------------------------- | -------------------------------------- | --------------------------- | ------------------------ |
| `system_prompt.ts:BUILD_SYSTEM_PREFIX/POSTFIX`                             | ~2k                                    | yes                         | yes (trimmed)            |
| `local_agent_prompt.ts:ROLE_BLOCK+COMMON_GUIDELINES+TOOL_CALLING`          | ~3k                                    | yes                         | yes                      |
| `mobile_ui_skill_pack.ts:CAIDE_MOBILE_UI_SKILL_PACK`                       | ~8k (contract) + 2380 lines skill body | yes                         | no (should be on-demand) |
| `ui-ux-mastery/SKILL.md`                                                   | ~18k                                   | yes (inlined via skillBody) | no                       |
| `motion-interaction`, `product-flow`, `backend-production`, `anti-ai-slop` | ~4k each                               | yes (companionSkills)       | no                       |
| `platform_contracts.ts:MOBILE_PRODUCT_CONTRACT`                            | ~0.5k                                  | yes (full prose)            | checklist only           |
| `ai_rules.ts:DEFAULT_AI_RULES_*`                                           | ~0.8k                                  | yes                         | yes (keep, but trim)     |
| `turbo_edits_v2_prompt.ts`                                                 | ~0.7k                                  | conditional                 | yes                      |
| `read_ui_reference.ts:UI_LIBRARY` (14 docs, 110KB)                         | 0 (on-demand)                          | no                          | yes (pattern)            |

Core without skill pack: ~6k. With pack: ~32k. That 26k delta is the over-engineering budget.

---

## 5. Proposed Architecture

### 5.1 Slim Core Prompt (`~3.5k`)

Keep in `local_agent_prompt.ts:buildLocalAgentSystemPrompt` / `system_prompt.ts:getSystemPromptForChatMode`:

```
ROLE_BLOCK (productRole)
PLATFORM_CONTRACT_CHECKLIST (7 bullets, 120 words, not full prose + not full skill)
APP_COMMANDS_BLOCK (rebuild/restart/refresh)
GENERAL_GUIDELINES (deduplicated, 5 bullets: edit scope, empty states, small files, anti-over-engineer, security)
TOOL_CALLING_BLOCK
TOOL_SELECTION_BLOCK (search_replace vs write_file)
DEVELOPMENT_WORKFLOW (understand → clarify → plan → implement → verify → finalize)
AI_RULES_BLOCK (framework-specific, trimmed)
SKILL_INDEX_BLOCK (new — see 5.2)
DEFERRED_TOOLS_BLOCK
```

Delete from core:

- `DESIGN_ENGINE_CONTRACT` full prose
- `skillBody` inlined mastery text
- `companionSkills` inlined bodies
- Full platform contract paragraph (`buildPlatformPrompt` full text) — keep checklist only
- Duplicated `COMMON_GUIDELINES` + `GENERAL_GUIDELINES_BLOCK` overlap
- Verbose `CODE_EXPLORATION_GUIDANCE` (keep 1-line pointer to `explore_code`)

### 5.2 Skill Index Block (New, ~300 tokens)

Replace inlined skill bodies with an index the model can act on:

```
<skill_index>
Available on-demand skills — read exactly one when its trigger matches, do not preload all:

- ui-foundation — design tokens, type scale, color system, spacing, radius (read_ui_reference: design-system)
- ux-flow — product archetypes, screen specs, IA, empty/loading/error states (product-archetypes, screen-spec)
- motion — duration/easing, capability routing, reduced-motion (motion-direction, motion-interaction skill)
- platform-tabs — when to use bottom tabs vs rail vs none, tablet adaptation (platform-patterns)
- anti-slop — distinctive UI rules, banned patterns (anti-slop)
- backend — Nitro, DB, auth, payments (read_guide: provision-backend, production-quality)
- review — quality rubric, audit gates, single final review (quality-rubric, design-audit)

Trigger: read the skill whose domain matches the user's current intent *before* writing code in that domain.
Do not read all skills. Do not run review until you have declared the build complete.
</skill_index>
```

Implementation: new file `apps/engine/src/prompts/skill_index.ts` exported and injected in place of `PLATFORM_UI_SKILL_PACK_BLOCK`. `mobile_ui_skill_pack.ts:CAIDE_MOBILE_UI_SKILL_PACK` becomes a lazy registry, not an inline string.

### 5.3 On-DemandSkill Files (Split Existing Pack)

Split `mobile_ui_skill_pack.ts` + `skills/` into discrete skill files under `apps/engine/src/prompts/skills/` with frontmatter:

- `ui-foundation/SKILL.md` — extracted from `ui-ux-mastery` sections 4–6 + `design-system.md` reference
- `ux-flow/SKILL.md` — from `product-flow/SKILL.md` + `screen-spec` template
- `motion/SKILL.md` — from `motion-interaction/SKILL.md` + `motion-direction` + `DESIGN_ENGINE_CONTRACT` motion rules subset
- `platform-tabs/SKILL.md` — from `platform-patterns.md` + `MOBILE_PRODUCT_CONTRACT` bullets 1/5/6 expanded
- `anti-slop/SKILL.md` — already exists, keep
- `backend/SKILL.md` — from `backend-production/SKILL.md`
- `review/SKILL.md` — from `quality-rubric` + `design-audit` + `REVIEW_GATE` (`design_engine_contract.ts:22`)

Each skill is `rawAsset` + registered in `read_ui_reference.ts:references/templates` or `read_guide.ts:GUIDES` so `read_ui_reference` / `read_guide` already serves them — no new tool needed. Add `read_skill` alias if we want explicit name, but reuse existing tools to avoid prompt bloat.

### 5.4 System-Determined Conditional Injection

Move decisions out of “model must remember to audit” into code that injects skill content only when needed:

| Decision                                       | Where                                  | Current (model)                                            | Proposed (system)                                                                                                             |
| ---------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Needs bottom tabs?                             | `framework_utils.ts` + task classifier | `MOBILE_PRODUCT_CONTRACT` says always ≥2 tabs              | System classifies: `utility` single-screen (calculator, timer) → 1 tab allowed; `multi-screen` → inject `platform-tabs` skill |
| Needs `design-spec.json` / `motion-spec.json`? | `checkpoint_chain.ts`                  | `PERSISTENT_SPECS_STAGE` says always before substantial UI | Gate on `screenCount>1` or `archetype != utility` or `files>5`; trivial app skips                                             |
| Needs 5-viewport audit?                        | `platform_contracts.ts`                | Always in skill pack                                       | System injects review skill only when `design-spec` exists                                                                    |
| Needs anti-slop?                               | always                                 | Always                                                     | Always, but via 10-bullet checklist in core, full skill only on demand                                                        |
| Needs motion detail?                           | always                                 | Always                                                     | Only if task mentions animation/transition or screenCount>2                                                                   |

Classifier: lightweight heuristic in `constructLocalAgentPrompt` (frameworkType + `aiRules` + prompt keywords like “calculator”, “single screen”, “quick”) or a 50-token LLM classifier call before prompt construction. Start with heuristic, upgrade to classifier if misfires.

### 5.5 Single Final Review (Not Per-File)

Change `DESIGN_ENGINE_CONTRACT` stage 6:

- Delete per-file “inspect 5 viewports + light/dark before finishing any screen”.
- Replace with: `After you declare build complete, read the 'review' skill (quality-rubric) and perform ONE audit. Fix critical/major issues in a single repair pass. Do not re-audit after each file.`

Implementation: add a turn-phase flag `buildComplete` in `local_agent_handler.ts`. On `hasIncompleteTodos()==false` + no pending writes, system injects via `prepare_step_utils.ts:prepareStepMessages` a one-shot `InjectedMessage: "Run single review: read_ui_reference name='quality-rubric'"`. Model cannot skip, but also cannot loop.

Cap review at 1 repair pass for trivial apps, 2 for multi-screen.

### 5.6 Additional Suggestions (Beyond User Request)

1. **App blueprint optional for trivial prompts** — If prompt is specific (“build a calculator, ios style”) skip `planning_questionnaire` + `write_app_blueprint` approval. Auto-generate lightweight blueprint (`appName: iOS Calc`, `primary: #FF9F0A`) without human gate. Keep blueprint gate only for vague prompts (“build an app for…”).
2. **Trim `GENERAL_GUIDELINES_BLOCK`** — deduplicate: `COMMON_GUIDELINES`, `GENERAL_GUIDELINES_BLOCK`, and `THINKING_PROMPT:23` repeat “be concise / no emojis / small files”. Consolidate to one 80-word anti-over-engineer block. Calculator does not need “never generate fake data” repeated twice.
3. **Collapse `TOOL_CALLING_BLOCK` + `PRO_TOOL_CALLING_BEST_PRACTICES`** — 13 rules + subagent guidance can be 5 bullets for trivial tasks.
4. **Adaptive `MAX_TOOL_CALL_STEPS`** — `DEFAULT_MAX_TOOL_CALL_STEPS = 100` is for redesigns. Set per-task: trivial=15, single-screen=30, multi-screen=60, redesign=100. Expose as `settings.maxToolCallSteps` override is already read at `local_agent_handler.ts:451`; just lower default and let classifier pick.
5. **Consolidate `AI_RULES` variants** — `ai_rules.ts:142` has 4 copies of tone/style. Extract shared tone into one constant, per-framework keeps only layout/conventions.
6. **Remove `turbo_edits_v2` from trivial adds** — Only inject when editing existing file, not greenfield creates.
7. **Cache skill reads** — `read_ui_reference` currently re-sends full skill text each call. Add server-side cache so second read in same turn is token-free.
8. **Telemetry on prompt size** — Log `promptTokens` per turn (`apps/server/src/agentGateway` metrics) to prove slimming worked; alert if >10k for trivial tasks.
9. **Single write per file** — Enforce via tool description: “Do not rewrite the same file twice without a verification step.” Prevents 3× `theme.js` rewrites.

---

## 6. Detailed Work Checklist

### Phase 0 — Baseline (1 day)

- [ ] Measure current prompt sizes per mode (build/mobile/flutter/web/ask) via `constructLocalAgentPrompt` unit test that asserts token count (use `tiktoken` or char/4 estimate). Commit baseline.
- [ ] Snapshot `bouncy-koala` timings: tool calls, turns, compaction size.

### Phase 1 — Extract Skill Index (2 days)

- [ ] Create `apps/engine/src/prompts/skill_index.ts` with index block.
- [ ] Modify `local_agent_prompt.ts:buildLocalAgentSystemPrompt` to inject `skill_index` instead of `CAIDE_MOBILE_UI_SKILL_PACK` body.
- [ ] Modify `system_prompt.ts:getSystemPromptForChatMode` similarly for build mode.
- [ ] Keep `PLATFORM_CONTRACT` as 7-bullet checklist only; move full prose to `platform-tabs` skill.
- [ ] Split `mobile_ui_skill_pack.ts` companion inlines into discrete files (no behavior change yet, just file moves).
- [ ] Test: trivial calculator prompt still builds, but core prompt <5k.

### Phase 2 — Conditional Injection (3 days)

- [ ] Add classifier heuristic in `constructLocalAgentPrompt` (`frameworkType`, `appTarget`, prompt length/keywords).
- [ ] Gate `design-spec.json`/`motion-spec.json` creation on `isSubstantialApp` (screenCount, archetype, file count).
- [ ] Gate bottom-tab requirement: single-screen utility allowed 1 tab; inject `platform-tabs` skill only when needed.
- [ ] Gate blueprint: auto-approve when prompt is specific (heuristic: contains app type + style + “build a …” and no ambiguity).
- [ ] Adaptive `maxToolCallSteps` per task tier.

### Phase 3 — Single Final Review (2 days)

- [ ] Remove per-file viewport audit language from `DESIGN_ENGINE_CONTRACT` stages 5/6.
- [ ] Add `review` skill (`review/SKILL.md`) with single-audit rubric.
- [ ] Add `buildComplete` injection in `prepare_step_utils.ts` / `local_agent_handler.ts` after todos empty + no pending writes.
- [ ] Cap repair passes (1 for trivial, 2–3 for multi-screen).

### Phase 4 — Cleanup + Telemetry (1 day)

- [ ] Deduplicate `COMMON_GUIDELINES`/`GENERAL_GUIDELINES`/`THINKING_PROMPT`.
- [ ] Trim `AI_RULES` shared tone.
- [ ] Add prompt-size telemetry + test that asserts trivial prompt <6k tokens.
- [ ] Update `AGENTS.md` and this plan, commit milestone.

---

## 7. File-Level Changes (No Code Yet — Inventory)

- `apps/engine/src/prompts/skill_index.ts` — NEW
- `apps/engine/src/prompts/mobile_ui_skill_pack.ts:43` — TRIM to registry only
- `apps/engine/src/prompts/local_agent_prompt.ts:36` — REPLACE `PLATFORM_UI_SKILL_PACK_BLOCK` with `SKILL_INDEX_BLOCK`
- `apps/engine/src/prompts/system_prompt.ts:313` — SAME replacement for build mode
- `apps/engine/src/prompts/platform_contracts.ts:12` — EXPORT `MOBILE_PRODUCT_CONTRACT_CHECKLIST` (7 bullets) separate from full `MOBILE_PRODUCT_CONTRACT`
- `apps/engine/src/prompts/design_engine_contract.ts:22` — SPLIT `PERSISTENT_SPECS_STAGE`, `REVIEW_GATE`, `MOTION_PURPOSE_RULE` into skill files; core contract keeps 3-line pointers
- `apps/engine/src/pro/main/ipc/handlers/local_agent/local_agent_handler.ts:451` — ADAPTIVE maxSteps via classifier
- `apps/engine/src/pro/main/ipc/handlers/local_agent/prepare_step_utils.ts:1` — ADD build-complete injection hook for single review
- `apps/engine/src/prompts/skills/*/SKILL.md` — NEW split skills (ui-foundation, ux-flow, motion, platform-tabs, review)
- `apps/engine/src/pro/main/ipc/handlers/local_agent/tools/read_ui_reference.ts:6` — REGISTER new references
- `apps/engine/src/prompts/ai_rules.ts:142` — DEDUP shared tone

---

## 8. Risks & Mitigations

- **Skill not read when needed** → System injection (classifier) guarantees critical skills; fallback: if model writes code missing required pattern (e.g., no `SafeArea`), injected linter message prompts skill read.
- **Review skipped** → `buildComplete` injection is system-enforced, not model-optional.
- **Blueprint auto-approve feels risky** → Only for high-specificity prompts; vague prompts still go through questionnaire gate.
- **Prompt too slim** → Keep `anti-slop` checklist (10 bullets) in core; full distinctiveness skill still on-demand.

---

## 9. Verification

- **Prompt size test**: `constructLocalAgentPrompt({frameworkType:'react-native', appTarget:'mobile'})` for trivial prompt → assert <6k chars.
- **Calculator smoke**: “build a calculator, ios style” → ≤15 tool calls, ≤3 min, 1 tab allowed, no `design-spec.json` required, single review pass.
- **Multi-screen smoke**: “build a 4-tab social app” → still generates `design-spec.json` + `platform-tabs` skill + 5-viewport review.
- **Existing tests**: `apps/engine` prompt snapshot tests updated to expect index, not inlined bodies.

---

## 10. Open Questions for Approval

1. Approve splitting `ui-ux-mastery` into 4+ skills vs keeping it as one `ui-ux` skill?
2. Approve auto-approve blueprint for specific prompts, or keep gate but make it 1-click?
3. Allow single-tab utilities (calculator) or must always ship ≥2 tabs with empty history?
4. Where should review live — as a tool (`captureEvidenceTool`/`runTestsTool` pattern) or as injected message?

---

## 11. Handoff

Next step after approval: commit this plan, then execute Phase 1 (skill index extraction) on branch `feature/prompt-slim-skill-routing`. No engine code changes until plan approved.
