# M6 Handover — API-Key Providers (openai/anthropic/google/openrouter/ollama)

> Handover document for continuing M6 of `plans/009-full-caide-import.md`.
> Written after M6a (compile-driven foundation) — **typechecks green, tests green, NOT yet committed.**

## Current verification status (2026-08-13)

| Check                             | Result                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` `npm run typecheck`    | **0 errors**                                                                                                                                                                                                            |
| `apps/server` `npm run typecheck` | **6 errors — pre-existing baseline** (identical on clean main, do NOT chase): `src/provider/wsPreviewHandlers.qualityGates.test.ts` ×4, `src/provider/Layers/EngineAdapter.ts:660`, `src/orchestration/decider.ts:1081` |
| `apps/engine` typecheck           | 33 pre-existing baseline errors (unchanged, unrelated to M6)                                                                                                                                                            |
| Server tests (touched files)      | 129 passed: `ProviderHealth.test.ts`, `providerStatusCache.test.ts`, `targetResolver.test.ts`, `skillsCatalog.test.ts`                                                                                                  |
| Web tests (touched files)         | passed: `appSettings.test.ts` (62), `composerDraftStore.models.test.ts` (46), `providerModelOptions.test.ts` (20), `providerUpdates.test.ts`, `wsNativeApi.test.ts`, `lib/providerModelPrefetch.test.ts`                |
| Full web suite                    | **NOT run to completion** (aborted by user) — recommended: `npm test` in `apps/web` before commit                                                                                                                       |

## The work so far

M5 shipped (engine preview RPCs, preview UI). M6 adds the 5 API-key providers alongside the 10 CLI providers.
All CLI-kind behavior is untouched; CLI-only subsystems were narrowed to a new `ProviderCliKind = Exclude<ProviderKind, ApiProviderKind>`.

### Committed (M1–M5)

- M2 `36930691`, M3 `d2b6e57a`, M4 `89575f55`, M5 engine `571d5789` / contracts `d8ecd84a` / server `610b98cd` / web `4eca0063`.

### M6a — UNCOMMITTED (31 files, +843/−34)

`git status` (top-level grouping):

**packages/contracts** — `orchestration.ts` (5 new ProviderKind literals + per-provider `ModelSelection` structs + `ApiProviderStartOptions` w/ baseUrl + `ApiProviderKind`/`ProviderCliKind`/`API_PROVIDER_KINDS`), `model.ts` (`ApiModelOptions` = one shared reasoning-effort struct, `API_MODEL_CAPABILITIES`, `MODEL_OPTIONS_BY_PROVIDER`, `DEFAULT_MODEL_BY_PROVIDER`, display names + aliases), `providerDiscovery.ts`, `settings.ts` (`ApiProviderSettingsBase` = ProviderSettingsBase + `baseUrl:""` + `apiKeyConfigured:false`, + per-provider async setters `ServerProviderSettings` + decode defaults), `agentMentions.ts`.

**packages/shared** — `model.ts` (`MODEL_SLUG_SET_BY_PROVIDER` + 5 sets; ollama=empty), `providerMetadata.ts` (`PROVIDER_DESCRIPTORS` + 5: available, `supportsNativeTurnSteering:false`, usage: null — this powers web `PROVIDER_SELECT_OPTIONS`).

**apps/server** — `provider/Layers/ProviderHealth.ts` (`providerChildKind`/`providerCommandEnv` → `ProviderCliKind`, new `isProviderCliKind` guard, API providers get **null** update capabilities, `runUpdateCommand` narrowed + call-site cast, `cachePathByProvider: Map<ProviderKind,string>`), `provider/providerStatusCache.ts` (indexOf cast), `providerUsage/index.ts` (narrowed kind + early-return when no fetcher), `provider/skillsCatalog.ts` (+5 entries, origin `["agents"]`), `agentGateway/targetResolver.ts` (+5 full `defineProviderOptionConfig` entries using `boolean-capability` validation), `provider/Layers/ProviderHealth.test.ts` fixture +5 enabled:false.

**apps/web** — `appSettings.ts` (`BUILT_IN_MODEL_SLUGS_BY_PROVIDER`+5, `PersistedProviderKind` literals+5 **kept simple transform** (do not collapse), `CustomModelSettingsKey`+5 keys, `PROVIDER_CUSTOM_MODEL_CONFIG`+5, `getCustomModelsByProvider`/`patchCustomModels`/`getCustomModelsForProvider`+5, `getCustomBinaryPathForProvider`+5→""), `providerModelOptions.ts` (**uses `ApiModelOptions` type**: there are NO `OpenAiModelOptions`/`AnthropicModelOptions` structs in contracts — do not import them; selection types DO exist: `OpenAiModelSelection`(= alias of `ApiModelSelection`), `AnthropicModelSelection`, `GoogleModelSelection`, `OpenRouterModelSelection`, `OllamaModelSelection`), `composerDraftModels.ts` `makeModelSelection`+5, `lib/composerSend.ts`+5→reasoningEffort, `components/ChatView.tsx` (`getProviderStartOptionsCustomBinaryPath`+5→null, `composerModelHintByProvider`+5), `components/settings/ProfileSettingsPanel.tsx` (`formatProviderLabel`→`PROVIDER_DISPLAY_NAMES`), `components/ProviderIcon.tsx` (openai→OpenAI, anthropic→ClaudeAI, google→FlaskConicalIcon, openrouter→GlobeIcon, ollama→TerminalSquareIcon — **no brand SVGs exist for the 3**, keep Lucide adapters), `components/PluginLibrary.tsx` (+5 → {plugins:false,skills:false}), `hooks/useProviderModelCatalog.ts` (staticOptions/dynamicSources/dynamicModelsByProvider+5), `lib/providerModelPrefetch.ts` (switch+5), `components/chat/composerProviderRegistry.tsx` (+5 shared "api" getState/render path), `Components/chat/{ProviderModelPicker.browser.tsx,ComposerModelEffortPicker.browser.tsx,TraitsPicker.browser.tsx}` fixtures+5, plus test fixtures: `appSettings.test.ts`, `providerUpdates.test.ts`, `wsNativeApi.test.ts`, `composerDraftStore.models.test.ts`.

## Remaining work

### 1. Close-out M6a (small)

1. Run full web suite to completion (`npm test` in `apps/web`) — aborted mid-run, only targeted files verified.
2. Run contracts tests + serialization checks (they were green pre-M6a-provider-edits; re-verify after the `settings.ts`/`model.ts` deltas).
3. `npm run fmt`, `npm run lint` (oxlint, NOT eslint; use AGENTS.md pre-commit flow).
4. Commit M6a as one commit in the existing style.

### 2. M6b — ApiAdapter (the core remaining piece)

- New openai-compatible chat adapter in `apps/server/src/provider/Layers/Services/` (precedent: `src/git/Layers/CodexTextGeneration.ts` HTTP chat).
- Model: `ApiAdapter` for the 5 providers — Anthropic needs the Anthropic Messages shape (not OpenAI chat-completions), Google uses Gemini generateContent. Likely: one generic OpenAI-compatible adapter for openai/openrouter/ollama + wrappers for anthropic/google, OR per-provider request mappers on a shared transport.
- Register in `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`.
- `apps/server/src/providerCredentials.ts`: add `ProviderCredentials` api-key methods (get/set/delete for openai/anthropic/google/openrouter/ollama). Keys live in the **secret store**, never in settings (settings only carry `apiKeyConfigured:boolean`).
- `listModels`/`listAgents` server endpoints currently unsupported for the new providers → will need HTTP discovery (e.g., GET /models from baseUrl) or empty/static fallback; web prefetch must not error-spam.
- Maintenance/update UI: API providers intentionally return null update capabilities (already wired).

### 3. M6c — server settings wire-up

- `apps/server/src/serverSettings.ts`: api-key redaction (never return key over IPC), patch handler for `baseUrl`/`apiKeyConfigured`, `setApiKey` side-channel to secret store. Tests in `serverSettings.test.ts`.
- Shared `packages/shared/src/serverSettings.ts` plumbing if needed.

### 4. M6d — web settings UI (currently only compile-scaffolded)

- `apps/web/src/components/settings/ProvidersSettingsPanel.tsx` / `ModelsSettingsPanel.tsx` / `DesktopSettingsPanels.tsx`: add per-provider API-key + baseUrl editing for the 5, `apiKeyConfigured` indicator, ollama default `http://127.0.0.1:11434/v1`.
- `MODEL_PROVIDER_SETTINGS`/`CUSTOM_MODEL_EDITOR_PROVIDER_SETTINGS` now include the 5 (test updated: provider list has 15 entries, droid still excluded from editor).

### 5. M6e — tests + feature-complete commit

- Unit/integration tests for ApiAdapter request mapping, credentials lifecycle, redaction; web tests for new panels.
- E2E not required for API providers (no packaged binary) unless UI flows are added.

## Key gotchas / decisions to honor

- Contracts `model.ts` has ONE shared `ApiModelOptions` (reasoningEffort/fastMode/thinking) — new provider options all reuse it. Don't create per-provider option structs.
- `exactOptionalPropertyTypes: true` workspace-wide → conditional spreads everywhere new options are built (`...(x ? {y: x} : {})`).
- Effect preview-build rules: `Schema.Literals([...] as const)` (array arg) for multi-value enums; `Effect.exit` + `Exit.isSuccess/isFailure`; `Schema.isGreaterThanOrEqualTo` (no `isPositive/isNonNegative`).
- API providers are NOT CLI kinds: never route through ProviderHealth CLI spawn/update/status cache paths; `providerChildKind`/`providerCommandEnv` are `ProviderCliKind`-typed.
- Web PersistedProviderKind transform is a simple 1:1 mapping — earlier attempt to collapse codex-style slugs into the API kinds was reverted; keep simple.
- Commits: only commit when the user asks. Never add AI/co-author attribution.
- Do NOT run `npx eslint`/`npx tsc` directly; use `npm run lint`/`npm run ts` per AGENTS.md.

## Next concrete move for Antigravity

Start with "Close-out M6a" (run full web suite + contracts tests, fmt/lint, commit), then M6b ApiAdapter. If scope is timeboxed, M6b is the highest-value remaining slice; M6d UI can reuse the opencode/google style panels from the "new caide" import source already referenced in plan 009.
