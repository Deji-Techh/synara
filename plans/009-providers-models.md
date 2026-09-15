# 009 — Providers & models: catalog, routing, keys, auth, custom/local

## 0. Goal

V1's provider stack, complete and free: full catalog, per-model routing, key storage,
live validation, ChatGPT auth, custom providers/models, local discovery. De-Pro'd:
no gateway, no quota, everything keyed by the user.

## 1. Catalog unification (single source of truth)

- Merge the two divergent V2 static catalogs (`dyad/providers/catalog.ts`,
  `packages/shared/.../languageModelCatalog.ts`) into ONE catalog covering V1's keys:
  openai/anthropic/google/vertex/openrouter/auto/azure/xai/bedrock/minimax/deepseek/
  `opencode-zen`/chatgpt/groq/mistral/together/cohere/fireworks/ollama/lmstudio/custom.
- Restore the remote catalog client: env-overridable URL, 5s fetch, 1h/30s TTLs,
  stale-while-revalidate, `KNOWN_BUILTIN_MODEL_ALIASES` (theme-generator, `dyad/auto/*`,
  help-bot) with `resolveBuiltinModelAlias` (theme/help decisions: 014/§5).
- OpenCode Zen free list: port the 6-model bundled list + optional live refresh
  (8s abort), minus quota gating. `isOpenCodeZenFreeModelId` returns.
- V1 `chatgpt` provider restored (registry entry + discovery + UI). V1 `auto` =
  first-key-wins (keep V2 `AUTO_KEY_ORDER`); no engine-gateway `auto`.

## 2. Routing (per-model transports)

- Port `get_model_client` dialect dispatch: OpenAI `responses`, Anthropic messages,
  Gemini, chat-completions, Azure, Ollama/LM Studio, custom — verbatim semantics.
- **Vertex service-account OAuth + Bedrock SigV4: port, not stub.** V2 marks them
  `needs-work` and throws — that is a regression. If a transport truly cannot run
  server-side, record it in 007 §7 with the exact technical blocker; otherwise ship it.
- Mid-stream model-switch failover (V1 `createWrappedStream`) OR whole-turn retry
  with equivalent UX — decide during implementation, document in-file.
- Keep V2's per-step scout/builder/planner + fallback chain as an advanced layer
  wired into the ported resolution (explicit→stored-default→auto).

## 3. Secrets & settings transport

- `StoredProviderEntry` gains `serviceAccountKey/projectId/location` (Vertex today
  has nowhere to persist). AES-256-GCM at rest stays; safeStorage ownership → 015.
- Provider get/set/test over the existing `provider_settings_*` WS (keep).
  Empty defaults-only saves must not clobber keys (keep V2 behavior).
- Env fallback kept: settings key wins, env fallback, keyless local. Fix naming:
  `OLLAMA_HOST` alias for `OLLAMA_BASE_URL`; canonical `GEMINI_API_KEY`
  (007 §6.11).

## 4. Live validation (inference probe, not list-models)

- V2's list-models check is weaker than V1's `streamText` probe (bad keys that list
  models pass). Restore inference-level probes per provider; keep V2's wider
  provider coverage. Restore keep-invalid-key dialog UX (017: settings surface).
- Azure/Vertex/custom get real checks (no permanent "saved, no live check" carve-outs).

## 5. Settings UI fields (hosts in 018; behavior here)

- Full 15-provider grid + per-provider page (key/base-URL/resource/Vertex triple/
  ChatGPT OAuth device flow with consent copy + plan display + disconnect).
- Custom providers CRUD (server-side, replacing browser-local custom models) +
  custom models per provider (add/edit/delete, token counts).
- Local discovery: live Ollama/LM Studio model listing (not hardcoded stubs).
- Default model + thinking budget + fallback wiring into turn resolution.
- `enableDyadPro` toggle: deleted (no engine). Env-var transparency panel: kept.

## 6. Acceptance

- Every catalog provider selectable with a user key; wrong keys fail at validation
  with V1-grade messages (`normalizeProviderError` incl. generic 429/quota mapping).
- Vertex/Azure turn succeeds end-to-end (or 007 §7 records the blocker).
- Zen free models listed without a key; custom provider CRUD persists server-side
  and is visible to the engine (not per-browser).
- Ported V1 provider/routing tests green.
