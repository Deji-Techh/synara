# AGENTS.md

## Permanent Session Rules (user requirements — do not forget)

1. **After EVERY compaction, re-read this AGENTS.md and `plans/006-dyad-transplant-plan.md`** (the ACTIVE plan) before continuing work. Do not assume context survived. `005-master-build-plan.md` is harness reference only; `004-caide-pure-harness.md` is superseded — ignore it.
2. **Commit after EVERY major change.** Major change = any milestone step, any new tool/feature, any significant refactor, any plan/AGENTS.md update. Commit even if the change is unpolished. Never leave the working tree dirty across sessions for structural work.
3. The product mission (see next section) overrides any codebase-local convention that conflicts with it.
4. **New product = "new caide" — the world's best AI app builder.** The web UI shell (ChatView, Sidebar, Profile, settings, all components) is KEPT with Caide-final design styling. The old backend engine (Codex process manager, orchestration, agentGateway, stub harness — system prompts, streaming, models/providers, tool calling, EVERYTHING agent-related) is STRIPPED. The Dyad + Dyad x Caide backend (prompts, local-agent tool loop, streaming, providers/models, tools, IPC, DB incl. Supabase/Neon, preview/build) is transplanted into `apps/server/src/dyad/*` with Caide overlay per `plans/006-dyad-transplant-plan.md`. Electron desktop kept as window shell. Frameworks: Blank, React Native, Flutter, Website — immutable per project. Continuous audit every milestone so nothing is missed.
5. **Autonomy mandate (user directive).** Execute the active plan without stopping for permission. Build the complete Caide runtime into the integrated server (keep `apps/desktop` window shell), keep the web UI, and commit after every milestone. If truly blocked, document the blocker and leave the tree in a safe committable state.

## Project Mission (World's Best AI App Builder)

Build the best AI app builder ever made — better than Lovable, Bolt, v0, Cursor, Replit Agent. The web UI shell stays with Caide-final styling. The old Codex-based backend engine is stripped entirely (system prompts, streaming, models/providers, tool calling, everything). The Dyad + Dyad x Caide backend (local-agent tool loop, prompts, streaming, providers, tools, IPC, DB incl. Supabase/Neon, preview/build, share services) is transplanted per `plans/006-dyad-transplant-plan.md`. Projects are immutable Blank, React Native, Flutter, or Website; the framework controls scaffold, prompts, tools, preview, build, and artifacts. Left sidebar chat/project creation logic is replaced by Dyad flows (framework selector kept); right sidebar + settings side host ported backends; Web/RN/Flutter previews use Dyad x Caide runtime inside Caide styling.

## Task Completion Requirements

- Do not run `bun fmt`, `bun lint`, or `bun typecheck` unless the user explicitly asks for them in the current conversation.
- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- Treat `bun fmt`, `bun lint`, and `bun typecheck` as heavyweight workspace checks: bundle them into one final verification pass per task whenever possible, and avoid rerunning the full set repeatedly during iteration.
- If a user asks for a small follow-up right after a recent full verification pass, prefer no rerun or the smallest reasonable re-check unless the user explicitly asks for full validation again.
- If the user asks to focus on code only, do not run `bun fmt`, `bun lint`, or `bun typecheck` automatically. In that mode, make the code changes first and only run verification if the user explicitly asks for it.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

Caide is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Model Selection

Rankings, higher = better. Cost reflects what I actually pay (OpenAI is near-free for me due to a deal), not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model       | cost | intelligence | taste |
| ----------- | ---- | ------------ | ----- |
| gpt-5.6-sol | 9    | 8            | 5     |
| sonnet-5    | 5    | 5            | 7     |
| opus-4.8    | 4    | 7            | 8     |
| fable-5     | 2    | 9            | 9     |

How to apply:

- These are defaults, not limits. You have standing permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work.
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Don't let cost prevent you from using the right model for the job. Instead, take advantage of cheaper options to get more information and try things before moving the work to a more expensive option.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): gpt-5.6-sol — it's effectively free.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- Reviews of plans/implementations: fable-5 or opus-4.8, optionally gpt-5.6-sol as an extra independent perspective.
- Never use Haiku.
- Mechanics: gpt-5.6-sol is only reachable through the Codex CLI — `codex exec` / `codex review` (my `~/.codex/config.toml` defaults to gpt-5.6-sol). Use the codex-implementation, codex-review, and codex-computer-use skills; for work they don't cover (investigation, data analysis), run `codex exec -s read-only` directly with a self-contained prompt.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter.

Using gpt-5.5 inside workflows and subagents (the model parameter only takes Claude models, so use a wrapper):

- Spawn a thin Claude wrapper agent with `model: 'sonnet', effort: 'low'` whose prompt instructs it to write a self-contained codex prompt, run `codex exec` via Bash, and return the report (use `schema` on the wrapper to get structured output back).
- Always label these agents with a `gpt-5.6-sol:` prefix, e.g. `{label: 'gpt-5.6-sol:review-auth'}` — the workflow UI shows the wrapper's Claude model, so the label is the only indication the real worker is gpt-5.6-sol.
- Codex runs can exceed Bash's 10-minute timeout: pass an explicit timeout, or run in the background and poll for the report file.
- Parallel gpt-5.6-sol implementation agents must use `isolation: 'worktree'` so codex edits don't collide in the shared checkout.
- Workflow token budgets only count Claude tokens; codex work is free and invisible to `budget.spent()`.

## Long-running Codex Work

gpt-5.6-sol is exceptionally capable on long-running tasks. Give it substantial, multi-step work when it is the right model for the job; do not split work up merely because it is large.

- The quality of the result depends on the prompt. Provide a detailed, self-contained brief: goal, relevant context, constraints, files or systems in scope, expected deliverables, and how to verify completion.
- State important decisions and non-negotiable requirements explicitly. Do not assume the model will infer project-specific conventions or the desired tradeoffs from a short prompt.
- For long tasks, ask it to inspect the current state first, execute the work end to end, and report the changes, verification, and any remaining risks.
- If the work can safely run in parallel, keep each task's ownership and worktree boundaries explicit so agents do not overlap.

## Transcript Performance Guardrails

- Treat transcript auto-scroll as a live-output feature, not a generic "working" feature. Buffering, reconnecting, pending approvals, and tool-only activity must not be wired as if assistant text is actively streaming.
- When wiring scroll-follow logic, count real transcript messages only. Tool/work rows must not retrigger the same "new content arrived" auto-stick path.
- Prefer the simpler fork-style transcript path for the common case. Small and medium transcripts should avoid virtualization churn unless there is a clear measured need.
- If virtualization is used, never couple `rowVirtualizer.measure()` directly to another bottom-stick or height-follow cycle. Height-follow for live output should stay one-way to avoid measure/scroll feedback loops.
- Preserve these behaviors with focused transcript tests when changing chat scrolling, timeline measurement, or sidebar-driven transcript updates.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## UI Conventions

### Open/close (toggle) animations — single source

Any UI element with an open/close toggle (expand/collapse, show/hide, disclosure) MUST reuse the shared disclosure motion in `apps/web/src/lib/disclosureMotion.ts`. Never write bespoke height/opacity transitions or one-off `@keyframes` for a toggle — use the same logic and the same functions everywhere so every toggle feels identical (220ms `ease-out`, with `motion-reduce` fallbacks).

- Shell + content (used by open/close project, sidebar sections, composer suggestions): `disclosureShellClassName(open)` on the grid shell, `DISCLOSURE_INNER_CLASS` on the inner wrapper, `disclosureContentClassName(open)` on the content — or the ready-made `DisclosureRegion` component (`apps/web/src/components/ui/DisclosureRegion.tsx`).
- Base UI `<Collapsible>` panels: wrap with `CollapsiblePanel` (`apps/web/src/components/ui/collapsible.tsx`), which applies `DISCLOSURE_COLLAPSIBLE_PANEL_CLASS`.
- Rotating chevron affordance: `DisclosureChevron` / `disclosureChevronClassName(open)`.

Reference usage: opening/closing a project and the sidebar sections in `apps/web/src/components/Sidebar.tsx`. If you find a toggle that animates differently, migrate it to this module rather than duplicating logic.

## Package Roles

- `apps/server`: Node.js WebSocket server + **Dyad transplant engine** (`src/dyad/*` prompts, local-agent tool loop, streaming, providers/models, tools, IPC, DB incl. Supabase/Neon, preview/build) with Caide overlay (`src/harness/*` adaptors + `src/design/tokens.ts`). Streams typed events to web + Electron.
- `apps/web`: React/Vite UI — dumb shell in Caide-final styling (`ui/*` + `disclosureMotion` + `PreviewStage 672px` + pill composer + left Sidebar + right dock + settings side). Owns session UX, connects via WebSocket typed events. Framework selector (`CreateAppDialog`) kept; sidebar creation logic rewired to Dyad flows.
- `apps/desktop`: Electron shell (window only — `main.ts`, `preload.ts`, `windowState`, `ipcChannels`, `desktopWsBridge`). No engine — kept intact.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts. Keep schema-only — no runtime logic. Extend with Dyad `ChatMode/ProviderSetting/ModelSelection/blockchain` contracts.
- `packages/shared`: Shared runtime utilities (`@caide/shared/*` subpath exports — no barrel).
- `apps/engine`: **DELETED.** Former builder path removed (archived at `backup/dyad-engine-transplant`).

## Local Dev Instance Isolation

- Never start the default `bun run dev` while another Caide instance is running unless the user explicitly wants shared ports/state.
- Use an isolated home dir and non-default ports when running alongside the user's own Caide instance, for example: `env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 CAIDE_NO_BROWSER=1 bun run dev -- --home-dir ./.caide-pr84 --port 58090`.
- Always dry-run first when avoiding conflicts: `env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 bun run dev -- --home-dir ./.caide-pr84 --port 58090 --dry-run`.
- Unset `CAIDE_AUTH_TOKEN` for browser dev instances unless the web app is also configured to connect with that token. If auth is accidentally inherited, the browser WebSocket can be rejected and the UI will show no threads even though SQLite has projects/threads.
- Check both server and web ports with `lsof -nP -iTCP:<port> -sTCP:LISTEN`. A desktop app can bind `127.0.0.1:<port>` while the dev server binds IPv6 `*:<port>`, and `localhost` may still hit the wrong process.
- If the UI shows no threads, verify the server path before changing SQL: inspect the isolated `state.sqlite`, then probe `orchestration.getSnapshot` over WebSocket. A healthy snapshot with projects/threads means the issue is client connection/hydration, not empty history.

## Provider Runtime (Important)

Caide's server wraps Dyad provider sessions via `apps/server/src/dyad/get_model_client.ts` (`getModelClient`, per-model routing `responses|chat/completions|messages`, Dyad Pro gateway via `llm_engine_provider.ts`) plus `language_model_constants.ts` catalog and `secret_storage.ts` keys. OpenCode Zen/Go remain supported endpoints within that router. The server streams typed events to web+Electron via WebSocket. See `plans/006-dyad-transplant-plan.md` §1 for engine layers.

Provider docs:

- OpenCode Zen/Go endpoints: `https://opencode.ai/zen/v1/*` and `https://opencode.ai/zen/go/v1/*` (per-model: `responses` for `grok/gpt/muse-spark`, `messages` for `minimax/qwen`, `chat/completions` fallback)

## Reference Repos

- Dyad donor: `/home/DejiTech/dev/dyad` (`src/prompts/`, `src/pro/main/ipc/handlers/local_agent/`, `src/ipc/handlers/`, `src/db/schema.ts`, `src/chat_stream/`)
- Dyad x Caide donor: `/home/DejiTech/dev/personal projects/dyad x caide` (`platform_contracts`, skill packs, scaffolds, `services/share-service` + `preview-control-plane`, `devicePresets.ts`)
- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
