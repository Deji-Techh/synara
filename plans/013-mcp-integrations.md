# 013 — MCP + integrations: registry, OAuth, Supabase, Neon, add-integration

## 0. Goal

V1's integration depth with V2's per-project overlays. MCP goes server-persisted;
Supabase/Neon go full-lifecycle; PAT-first where V1 was OAuth-only by necessity,
OAuth broker flows ported where they were the product (MCP servers).

## 1. MCP registry (P0)

- Server-persisted registry: implement `McpServersTransport` over WS →
  `McpManager` + `dyad.db` (`mcp_servers`, `mcp_tool_consents` DDL exists — wire it).
  Panel keeps local UX, gains server round-trip (list/create/update/delete).
- Transports: add `http` (Streamable) with stored-token overlay; stdio+sse stay.
- Full OAuth: DCR persist, client secret/scope/callback-port in `mcp_oauth_start`,
  port probe (default-first, ephemeral fallback, dual-stack), redirect-URI hint in UI,
  disconnect + `probe_connection`, error taxonomy (`discovery_failed/unauthorized/
  other`) with inline retry buttons, expanded callback page (success/error +
  Open-Caide deep link).
- Encrypted `oauth_state`/bearer at rest + `isOauthStorageEncrypted` banner
  (015 owns safeStorage; this plan consumes it).
- Bearer-token CRUD control; env/headers `KeyValueEditor`s; per-tool
  `ask|always|denied` selects (global stays the default); composer MCP picker.
- Consent handshake: add `classifierPending` + reason + `consentClassified` event;
  classifier default-off (007 §6.12).
- Shutdown/quit guard calls `sharedMcpManager().shutdown()`; deep-link
  `add-mcp-server` prefill (015 router).
- Keep: `search`/`get_schema` discovery, BM25, MAX 5, policy text verbatim.

## 2. Supabase (full lifecycle)

- REST additions: branch listing, edge-function logs (→ console, 011), social-auth
  provider management (8 providers), org details/members, affected-module deploy +
  prune + migration switches (`enableSupabaseWriteSqlMigration`,
  `skipPruneEdgeFunctions` → 018).
- Link/unlink per app with `assertNoNeonProject` mutual exclusion; `DbLink` gains
  `organizationSlug/parentProjectId`.
- Test users: create/delete + boot-time orphan reconcile + RLS check tool.
- OAuth broker (hosted) + deep-link return: port (015) — PAT stays the primary path.
- Settings: per-provider cards (org list, migration/prune switches); chat/dock
  project-info chips.

## 3. Neon (full lifecycle)

- Link/unlink existing projects; branch typing (`production|development|snapshot|
  preview`) + active-branch select + per-branch env resolve + deploy preference
  (`setSelectedDatabaseBranchType`); Nitro-guard + orphan cleanup + env-snapshot
  restore on failure.
- Neon Auth: ensure/get/update email verification + cookie secrets per branch;
  verification switch in UI.
- Vercel sync: per 012 §2. Test branches + boot orphan reconcile.
- OAuth broker + timeout toast: port (015); API-key-first UI stays.

## 4. add-integration UX

- Blocking transport + follow-up kept; card gains provider radio
  (supabase|neon, Neon framework-gated + experimental badge) → Next reveals
  Database panel/Configure tab; recovered-request + completed/expiry card states.
- Home: `HarnessPrompts.tsx` IntegrationCard + Database dock pane (017).

## 5. Guides

- Keep V2's extended `provision-backend.md` (Supabase alternative + PAT path);
  re-add the `NEON_AUTH_SECRET 32+` step if the Auth scaffold needs it.

## 6. Acceptance

- MCP server add (stdio/http) → OAuth connect → per-tool consent → discovery →
  execution, with secrets encrypted and panel state surviving restart.
- Supabase/Neon link → branch ops → deploy → unlink-clean, e2e with test creds.
- add-integration radio → configure → continuation turn fires.
