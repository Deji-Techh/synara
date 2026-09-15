# 012 — Publish / deploy / share / collaborate

## 0. Goal

V1's shipping plane, agent-mediated per V2's `PublishPanel` contract (pane links
state; mutations stay agent-driven). `services/share-service` + `preview-control-plane`
are already vendored verbatim — this plan wires the clients.

## 1. GitHub + Vercel

- GitHub: PAT + `gh`-CLI tools exist — add device-flow OAuth (V1
  `getGitHubDeviceCodeUrl`/`getGitHubAccessTokenUrl`), full git orchestration
  (push/fetch/pull/rebase/merge/conflicts/branches), collaborator invites.
  UI: `PublishPanel` "Connect repo / Push / Invite" runbook buttons invoking the
  existing tools (no direct mutations from the pane).
- Vercel: keep PAT REST + website-only guard; PublishPanel rows stay read-only
  with "ask agent" hints.
- Amber "GitHub required for Vercel" gate banner ported.

## 2. Neon→Vercel env sync (correctness)

- Branch-aware `vercel_env_sync`: owned keys (`DATABASE_URL`, `NEON_AUTH_*`;
  never `POSTGRES_URL`), **production-only targets** (V1 default — V2's
  all-three-targets upsert is wrong until decided), trusted-domain allowlist
  diff (`reconcileTrustedDomains`), keys-only sync preview.
- `vercel_env_remove` on disconnect (list + delete owned keys), default-on with
  opt-out checkbox in the Database panel.
- `.env.local` selective inject/strip: `DATABASE_URL+POSTGRES_URL`, Next.js-only
  cookie secret, `.neon.tech` strip-guard, Nitro-rollback coupling.
- UI: sync card in DatabasePanel Neon section (donor `DatabaseSection` shape);
  `DatabaseEnvVars` readout (read via file, writes agent-side).

## 3. Supabase deploy pipeline

- Beyond single-function deploy: `_shared` module graph, bundle-only(4)/
  activating(1) concurrency queue, prune dangling, progress events → DatabasePanel
  Supabase section via `requestDatabasePanel` transport.
- Keep the auto-deploy prompt contract ("deployed automatically, don't tell the
  user to deploy manually").

## 4. Project packages + remote share + collaboration + preview sessions

- CAIDEPKG export/inspect/import (`project_package_archive` + service, incl.
  manifest/security-report/git+DB rehydration) + `ImportProjectPackageDialog` home.
- Remote share client: create/complete/download/revoke against the transplanted
  service (signed URLs, landing pages, expiry sweeps, rate limits are server-side).
- Collaboration client: sessions/invites/OT/SSE/checkpoints → roster in `publish`
  GitHub row + live agents in `goals` SubagentsTab (017); new `collab` dock pane
  only if roster+activity don't fit.
- Preview sessions/revisions/worker leases client (011 tunnel + 016 runtime).
- Local artifact grants: add `list_shares` readout to PublishPanel.
- Deploy toasts/banners reuse the shared toast primitive; no new toast system.

## 5. Database UI richness

- Port donor `DatabaseSection` cards (branch picker, migration panel, env vars,
  sync-to-Vercel, amber gates, toasts) into `DatabasePanel`; add
  `selectedDatabaseBranchType` + `set-selected-database-branch-type` channel.
- Supabase/Neon management surfaces per 013 (edge logs, social auth, Auth config).

## 6. Acceptance

- Repo create→push→invite; Vercel deploy; Neon env sync + trusted domains +
  removal on disconnect — all e2e against real services with test creds.
- Package export→import round-trip incl. git history + DB linkage.
- Coolify flow still works (V2-new, keep). Cloudflare stays out of scope.
