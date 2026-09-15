# 015 — Shell & platform: deep-links, dialogs, safeStorage, first-run, notify

## 0. Goal

V1's platform integrations in `apps/desktop`, minus business IPC (WS-replaced by
design). V2 already exceeds V1 on updater robustness, window-state, badge,
menus, OS-theme, crash integrity — keep all of that; close the true gaps below.

## 1. Deep-links + OAuth returns (P0)

- Register `caide://` (+ keep `dyad://` compat? decide: V1 used both; Linux
  `.desktop` mime included) via builder config + `setAsDefaultProtocolClient`.
- `open-url` (mac) + argv-URL parsing + `second-instance` dispatch + queued
  dispatch (cold-start safe).
- All 7 V1 routes: `neon-oauth-return`, `supabase-oauth-return`, `dyad-pro-return`
  (drop — no Pro; record), `mcp-oauth-return` (focus + loopback tokens),
  `add-mcp-server` (prefill panel draft), `add-prompt` (prefill prompt draft),
  `receive-project` (pending-share token → import flow, 012).
- Bridge `deep-link-received` to renderer/server over WS (no V1 IPC shape).
- Linux protocol registration helper (best-effort, V1 parity).

## 2. File dialogs (P1)

- Add `open-file` (filters, multi-pick) + filtered save variants (keystore,
  artifact export, package export, reference image) alongside existing
  `pick-folder`/`save-file`. Covers V1's 8 dialog sites (Capacitor, node folder,
  import, custom apps folder, app location, package open/save, reference pick).

## 3. Secrets & storage

- Assign safeStorage ownership (desktop main pre-ready vs server): keychain unlock
  retry + legacy `os_crypt v10` recovery path for undecryptable secrets
  (OAuth tokens, provider keys). `providerKeyPresence` stays read-only.
- `isOauthStorageEncrypted` signal for the MCP/Database banners (013).
- Desktop storage-migration/recovery (V2 exceeds V1 — keep); no V1 Neon-migration
  IPC (WS-replaced).

## 4. First-run & notifications

- First-run flag + macOS move-to-Applications prompt (V1 comment: required for
  auto-update stickiness).
- Notification delivery: WS events (goal completed/failed, chat complete, consent,
  questionnaire, env-vars) → desktop `notificationsShow` + badge; 10s auto-close;
  permission flow + test notification + Mac guide; chat-event-notifications setting
  (018) gates chat toasts.
- Session debug bundle endpoint (WS-served) + updater-error recording (keep V2
  diagnostics).

## 5. Decisions (record in 007 §7 if dropped)

- Notch overlay IPC: drop (no spec) — default.
- `dyad-media://` scheme: verify media resolves via server/static; else re-add.
- deb/rpm targets: stay dropped (dmg/nsis/AppImage only).
- Telemetry: stays dropped (no PostHog anywhere).
- Global OS shortcuts: none (neither had them).

## 6. Acceptance

- Each deep-link route e2e (OAuth returns land in settings/panels; share token
  opens import; add-mcp/add-prompt prefill).
- Dialog matrix covered (open/save/filtered/multi).
- Restart with rotated keychain identity recovers secrets or shows the banner.
- First-run move prompt appears once on macOS; notifications fire for the 5 tags.
