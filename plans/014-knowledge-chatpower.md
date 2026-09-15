# 014 — Knowledge & chat-power: skills, prompts, queue, tabs, cards, image, help

## 0. Goal

V1's knowledge inputs and chat affordances, re-homed into V2 surfaces (017).
Backend stores first, UI bindings second. 17-goal slash parity included.

## 1. Skills & prompts library

- User-skill CRUD (title/desc/content/slug + `SLUG_REGEX` + app assignment) in
  `SkillsSettingsPanel`; wire draft `skills` chips to the dialog.
- Prompts library + `@prompt:id` mentions: `promptLibrary` store + hook, `@` source,
  `prompt://` token, stream-time expansion (V1 `replacePromptReference` semantics).
- AI-rules editor panel (neither V1 nor V2 has one — net-new, small):
  read/edit/preview `DEFAULT_AI_RULES`, per-project, composer `+` entry.
- Collections: keep V2 `collectionsStore` (V1 parity, renamed); port
  `CollectionDetailView` grid only if history dialog needs it.
- Library page: unified all/themes/prompts/media route reusing `PluginLibrary`
  patterns (V2 has discovery-only).

## 2. Context inputs

- Codebase-context picker (glob include/exclude + smart auto-includes + token
  counts) as `@`-mention `Local` group + `ComposerLocalDirectoryMenu` rows;
  reference-files dialog as second tab.
- `@media:` mentions backed by the workspace media index; picked media renders
  with the image-chip pattern. Parser semantics (`parse_media_mentions`) kept.
- MCP tools picker (Traits-style radio section or `+`-submenu); execution keeps
  `/mcp` template flow. Themes entry routes to settings palette.
- `+` menu expansion: codebase-context, attach-as-context vs upload-to-codebase,
  reference files, generate-image, token-usage toggle (sibling menus already cover
  models/dirs/commands).

## 3. Queue, tabs, versions, todos

- Queue: add pause/resume, reorder (move/up-down), collapsed count/status header,
  `clearQueuedTurns` (V1 had per-row delete only — clear-all is net-new, fine).
- Chat search dialog: per-chat message-content search with `<mark>` snippets
  (palette stays project/thread search).
- Chat tabs strip (session-scoped, overflow, drag, group-by-app, `Ctrl+Shift+T`
  reopen) above `ChatView`.
- Version pane (virtualized, favorite/note/search/checkout/restore/DB badge) on
  harness git RPC; `BranchToolbar` stays the switcher.
- Todos: collapsed `completed/total` progress bar in transcript.
- Drafts: V2 `composerDraftStore` already supersets V1 — no action.

## 4. Errors, banners, toasts

- `ChatErrorBox` (normalize quota/key/fallback incl. generic 429 mapping from 009,
  actions: provider settings + new thread + retry).
- Composer banners via `ComposerInputBanners` precedence: setup/key-missing (first),
  context-limit (with `/compact` action), rate-limit keeps transcript banner.
- Token/context meter: footer `ContextWindowMeter` already maps 1:1 — wire the
  signal, no new surface.
- Input-request (y/n) toasts: route through `ComposerPendingUserInputPanel`
  (no V1 `InputRequestToast` port).
- Verify the 5 OS-notification tags map onto `taskCompletion` (015 renders).

## 5. Slash commands & aux menus

- Restore the 12 dropped `goal-*` subcommands (`status/pause/resume/cancel/edit/
  steer/tasks/logs/evidence/blockers/retry/verify/history`) onto the goals UI.
  Keep V2's `/fork /side /review /compact /fast` additions.
- Shortcuts sheet gains the chat bindings (history-recall, `Cmd/Ctrl+K`
  chat-search, `Ctrl+Shift+T`).

## 6. Transcript cards (the ~50-card gap)

- Extend `ChatMarkdown` `RenderUnit` (or `CaideToolCards.tsx`) with per-tool cards
  driven by `harnessToolPresentation`: write/edit/search-replace/grep/explore/
  copy/delete/dependency/SQL/logs/integration/read/list/DB-schema/project-info/
  read-guide/image/script/MCP-call+result (paired)/MCP-search/schema/web-search/
  crawl/fetch/code-search/codebase-context/status/compaction/write-plan/exit-plan/
  questionnaire/step-limit/security-finding/problem-summary/output+FixAll/think/
  command. Restore `FixAllErrorsButton`, MCP `mcpPairing`, `normalizeTestPath`.
- Image generation: `/image` command + composer `+` entry + `ComposerStackedPanel`
  progress strip (cancel/retry/dismiss) + transcript tool card with thumbnail;
  style presets in Image settings, appended server-side. Backend cascade stays.

## 7. Theme generator & help bot (user-keyed, free)

- Theme dialog (source toggle → keywords/mode → model → editable prompt → save)
  in Settings → appearance; models from provider settings (no `dyad/theme-generator`
  alias verbatim — or port the alias table onto user keys per 009 decision).
- Help bot: dialog + backend as a harness tool over the provider router
  (no hard-coded `helpchat` endpoint).

## 8. Onboarding (growth, no paywalls)

- Setup/key-missing banner + first-run hero variant + pending-draft resume via
  `composerDraftStore` (no new atom).
- `SkippableBanner` primitive for notifications/telemetry/context banners.
- Uncommitted-changes banner row + review/commit/discard dialog in the git dock
  pane (never a transcript banner).
- Import dialog: add GitHub-URL tab + post-import AI_RULES bootstrap turn template.
- Release channel picker in System tools (stable/beta → desktop updater flags).
- Do NOT port: promo rotation, quota banners, Pro banners (V1 self-disabled),
  release-notes iframe (WhatsNew supersedes), orb-halo streaming style.

## 9. Acceptance

- `@prompt` / `@media` / context-picker round-trips insert correct tokens.
- Queue pause/reorder/clear; tabs reopen; version restore; todo progress visible.
- All 17 goal slashes route; error box + banners appear on forced failures.
- Image dialog → strip → transcript card e2e; theme dialog saves a theme.
