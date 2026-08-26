# 002 — Mobile App Remote Connection

Status: READY (not started)
Last updated: 2026-08-26
Depends on: `001-dyad-backend-rebuild.md` (IN PROGRESS) — shares server, orchestration, dyad runtime
Reference implementation: `/home/DejiTech/dev/t3code` (T3 Code) — `apps/mobile`, `apps/server/src/ws.ts`, `packages/client-runtime`, `docs/internals/remote.md`
Caide repo: `/home/DejiTech/Caide-final`

> Plan-only. No code in this file may be treated as implemented until its milestone checklist is checked and committed.

---

## 1. Mission

Ship a first-class Caide mobile app (iOS + Android) for **remote connections, chat continuations, monitoring, and previews** — same quality bar as T3 Code's mobile app (`apps/mobile`).

Constraints from `AGENTS.md:3-5` and `001:91-143`:

- Keep Caide's desktop shell + `apps/web` UX. Mobile is a new surface, not a redesign.
- The integrated dyad runtime in `apps/server` remains the single execution owner. Mobile never runs agents.
- Immutable project frameworks `blank | react-native | flutter | website` (`packages/contracts/src/projectFramework.ts`) stay authoritative for prompts/tools/preview/build — mobile routes through them.
- No edits to T3 repo. Its code is a read-only reference; copy patterns verbatim where noted, adapt where Caide diverges.

---

## 2. What we have today (Caide) vs what T3 proves works

### 2.1 Caide today

| Area | Caide (`Caide-final`) | Location |
|---|---|---|
| Server | Node WebSocket (dual `ws` servers, bespoke RPC) | `apps/server/src/nodeHttpServer.ts:76,114-221`, `apps/server/src/wsRpc.ts:197-237`, `apps/server/src/config.ts:43-67` |
| Orchestration | Event-sourced (decider + projector + receipts, 80+ migrations) | `apps/server/src/orchestration/Services/OrchestrationEngine.ts`, `persistence/Migrations/` |
| Runtime | dyad embedded `createEmbeddedEngine` fresh DB, `EngineAdapter` thin wrapper | `apps/server/src/dyadRuntime/embeddedRuntime.ts:17`, `apps/server/src/provider/Services/EngineAdapter.ts:40-271`, `apps/engine/src/embedded.ts` |
| Auth/remote | `--host`/`--auth-token` + loopback default + `REMOTE.md:27-65` + one-time pairing link → cookie | `apps/server/src/auth/Services/ServerAuth.ts`, `http.ts:407-465`, `trustedOrigins.ts:66-120` |
| Web | React 19 + Vite 8 + Zustand + Lexical + Tailwind 4, 130+ components | `apps/web/src/components/ChatView.tsx`, `composer*.ts`, `BrowserPanel.tsx` |
| Desktop | Electron 40 wrapper | `apps/desktop/src/main.ts`, `dist-electron/main.js` |
| Mobile | **none** | — |
| Contracts | `ProjectFramework`, `OrchestrationProject/Thread/Session`, `WsCompatibility` | `packages/contracts/src/projectFramework.ts`, `orchestration.ts:498-1350` |
| Shared | 52 subpath exports, no `client-runtime` | `packages/shared/package.json:6-275` |

Hard limits for a phone today (`001:598-611` context, `REMOTE.md`):

1. `host 127.0.0.1` default — phone can't reach without `--host 0.0.0.0` + `CAIDE_AUTH_TOKEN` + firewall.
2. `devUrl` incompatible with remote `config.ts:60-62` — live Vite dev can't be tested from phone.
3. Single shared bearer, no per-device ACL, no `wsTicket` short-lived flow.
4. Browser-only remote `http://<ip>:3773` static SPA; no QR pairing, no OTA, no offline cache.
5. Preview/device flow assumes desktop localhost `DevServerManager` + `mcp__caide__browser_snapshot`; no remote stream to phone.

### 2.2 T3 what we steal

| T3 piece | Why it matters | Source |
|---|---|---|
| `packages/client-runtime` (connection supervisor + RPC session + Atom state) | 1 codebase powers web+mobile, React never builds transports | `packages/client-runtime/src/connection/{supervisor.ts,session.ts,model.ts}`, `docs/internals/overview.md:51-59` |
| 4 targets `Primary|Bearer|Relay|Ssh` + `AdvertisedEndpoint` hints | remote is a connection-layer choice, not a second runtime | `packages/client-runtime/src/connection/model.ts:51-58`, `docs/internals/remote.md:44-89` |
| Ticketed WS auth (`POST /api/auth/websocket-ticket` → 5min `wsTicket`) | long-lived bearer never in URL, HTTPS page can still reach `wss://` | `apps/server/src/auth/SessionStore.ts:DEFAULT_WEBSOCKET_TOKEN_TTL`, `docs/internals/remote.md:198-209` |
| `npx t3 pair [--tailscale]` QR | demo that sells remote; mints one-time owner token | `docs/user/remote-access.md:7-23`, `apps/server/src/bin.ts` |
| Tailscale endpoint provider (`ensureTailscaleServe`) | private HTTPS without opening ports | `packages/tailscale/src/tailscale.ts`, `apps/desktop/src/backend/tailscaleEndpointProvider.ts` |
| Hosted pairing `https://app.t3.codes/pair?host=...#token=` | browser exchanges token directly, strips hash | `packages/shared/src/remote.ts`, `apps/web/src/hostedPairing.ts` |
| Expo mobile: 3 variants, OTA fingerprint, `react-navigation`, widgets, share extension | shipped to App Store/Play Store without forking logic | `apps/mobile/app.config.ts:59-373`, `apps/mobile/src/Stack.tsx:446-657` |

---

## 3. Target architecture (Caide after this plan)

```
┌──────────────────────────────────────────────────────────┐
│ Clients: apps/web (Vite) | apps/desktop (Electron)       │
│          apps/mobile (Expo RN 0.85)                      │
│ shared: packages/client-runtime                          │
│  connection supervisor, RpcSessionFactory, Atom state    │
└──────────────────────┬───────────────────────────────────┘
                       │ Effect RPC over WebSocket /ws
                       │ contracts: packages/contracts (WsRpcGroup)
┌──────────────────────▼───────────────────────────────────┐
│ apps/server                                              │
│  orchestration engine (event-sourced, already exists)    │
│  dyadRuntime (embedded, frameworkRegistry)                │
│  provider adapters (EngineAdapter + future Codex/Claude) │
│  checkpointing (VCS refs), terminals, git, filesystem    │
└──────────────────────┬───────────────────────────────────┘
                       │ per-framework tooling
┌──────────────────────▼───────────────────────────────────┐
│ Frameworks: blank | react-native (Expo) | flutter |      │
│             website (Vite) — preview/build routed by     │
│             project framework                            │
└──────────────────────────────────────────────────────────┘

Connections (docs/internals/remote.md:11-32 model):
  Primary (platform-managed local) | Bearer (direct ws/wss)
  | Relay (managed tunnel) | Ssh (desktop-managed launch)
  + AdvertisedEndpoint providers: Tailscale Serve, LAN detector
  + Pairing: one-time owner token → bearer session → wsTicket
```

Invariant: one `ExecutionEnvironment` = one `environmentId` (`stateDir/environment-id`, `apps/server/src/environment/ServerEnvironment.ts` in T3) = one server that owns providers/projects/terminals. A saved mobile environment is client-local; projects/threads remain environment-local (`RepositoryIdentity` grouping is UI-only).

---

## 4. Milestones

Each milestone ends with a verifiable demo, a test gate, and a commit. Do not start M(N+1) until M(N) check is green.

### M0 — Foundation (3–5 days) — no mobile UI yet

Goal: reproduce T3's RPC/auth/environment scaffolding inside Caide so remote is host-ready.

Scope:

- Introduce `packages/client-runtime` (`Caide-final/packages/client-runtime`).
  - Copy `connection/{model,catalog,credentialStore,driver,supervisor,resolver,profileStore,wakeups}` + `authorization/remote.ts` + `rpc/session.ts` + `state/` + `relay/` + `environment/` from `t3code/packages/client-runtime/src` (verbatim where generic, adapt where Caide-specific).
  - Define `Platform` interface: `SecureStore` (expo-secure-store vs localStorage), `Sqlite` (expo-sqlite vs indexedDB), `Network` (expo-network vs online), `BackgroundTask` (expo-task-manager vs visibilitychange).
  - Mirror `apps/web/src/connection/runtime.ts` ↔ future `apps/mobile/src/connection/runtime.ts` (only platform layer differs).
- Migrate bespoke WS to Effect RPC group:
  - Add `packages/contracts/src/rpc.ts` `WsRpcGroup` with `stream:true` members `orchestration.subscribeShell`, `subscribeThread`, `subscribeServerConfig`, `terminal.attach` (reference `t3code/packages/contracts/src/rpc.ts:WS_METHODS`).
  - Server: `apps/server/src/ws.ts:websocketRpcRouteLayer` pattern (auth → `RpcServer.toHttpEffectWebsocket`), per-method scope map `RPC_REQUIRED_SCOPE` via `EnvironmentAuth` (reference `t3code/docs/internals/overview.md:31-45`).
  - Keep `nodeHttpServer.ts:76` dual-server split until RPC cutover passes; then compress only feature socket.
- Introduce `ExecutionEnvironment` identity:
  - `stateDir/environment-id` stable file + `ServerEnvironment` service.
  - `AdvertisedEndpoint` generation (loopback, lan, tailscale when detected) via `GET /api/environment` + RPC `environment.getAdvertisedEndpoints` (T3: `docs/internals/remote.md:66-90`, `ConnectionsSettings.tsx:77-85`).

Exit criteria:

- `bun run typecheck` + `bun run test` green on `packages/contracts` + `packages/client-runtime` + `apps/server`.
- Web connects via new `RpcSessionFactory` (one attempt, supervisor retries) — same UX as before.
- `curl /api/environment` returns `environmentId` + endpoint list; logs show `Accepting commands` before HTTP listening (startup order `serverRuntimeStartup.ts:128-131`).

### M1 — Pairing & remote access (4–6 days) — phone can reach web today

Goal: make Caide remotely pairable with QR, Tailscale-optional, HTTPS-ready.

Scope:

- Short-lived `wsTicket` flow:
  - `SessionStore.ts:DEFAULT_WEBSOCKET_TOKEN_TTL = 5min`, `EnvironmentAuth.issueWebSocketTicket`.
  - `POST /api/auth/websocket-ticket` (bearer header in, ticket out), WS `GET /ws?wsTicket=` only; reject `?token=` non-loopback (keep bootstrap exception for legacy pairing → revoke after cutover). Document in `docs/internals/environment-auth.md`.
  - Per-method `authorizeEffect/authorizeStream` scopes (valid socket ≠ authorized to call everything).
- Pairing command:
  - `apps/server/src/bin.ts` subcommand `pair [--tailscale] [--tailscale-serve-port] [--ttl] [--base-dir]` → finds running server (probe `~/.caide/userdata` or worktree `.caide`, like `t3 pair` `docs/user/remote-access.md:11-21`), `BootstrapCredentialService` issues one-time owner token, prints `pairingUrl` + `qrcode` + lists endpoints. Must warn if only loopback.
  - Startup `AuthControlPlane.issueStartupPairingUrl` already exists (`main.ts:361-421`) — adapt to new ticketed flow; ensure pairingUrl carries standard scopes vs admin where needed (T3 note `AGENTS.md:83`).
- Desktop: Settings → Connections parity:
  - `apps/desktop/src/backend/caideEndpointProvider.ts` (copy `tailscaleEndpointProvider.ts` pattern).
  - Toggle Network access → restarts backend on `0.0.0.0`/`tailscale ip` with token, shows default endpoint + `+N` expand, `selectPairingEndpoint` priority: saved override → `isDefault` → non-loopback → HTTPS-compatible → nothing (no unconditional loopback fallback). Persist override by stable kind `lan:`, `tailscale-ip:`, `tailscale-magicdns:` not raw IP.
  - `Create Link` copies pairing URL (QR via `Workspace` component).
- Tailscale provider (optional but cheap):
  - `packages/tailscale` (`ensureTailscaleServe/disableTailscaleServe`) + `apps/server/src/server.ts` acquire mapping when `tailscaleServeEnabled` setting true; advertise `private-network` endpoints. Desktop toggle `Enable Tailscale HTTPS` (`docs/user/remote-access.md:63-77`).
- Hosted pairing:
  - `packages/shared/src/remote.ts` helpers + `apps/web/src/hostedPairing.ts`: `https://app.caide.codes/pair?host=https://backend:3773#token=...` → read host, hash token, exchange, strip history. Block `http` backend from HTTPS page with mixed-content error (keep direct `http://192.168.x.y:3773` for bare-web client only).

Exit criteria:

- From a phone on same LAN: `npx caide pair` QR scans → `http://<ip>:3773` web opens paired, survives restart (session, not token replay).
- Tailscale toggle produces `https://machine.tailnet.ts.net/` endpoint and pairs over it; `https://app.caide.codes/pair` works for that endpoint.
- `bun run test` + manual matrix: loopback, bearer LAN, tailscale HTTPS.

### M2 — Client runtime hardens (2–3 days)

Goal: connection supervisor owns lifecycle; React stays dumb.

Scope:

- `connection/supervisor.ts`owns retry/backoff/offline/wakeups (`wakeups.ts`); `rpc/session.ts` does one attempt only (T3 rule `docs/internals/overview.md:46-49`).
- `credentialStore.ts` + `profileStore.ts` (Known environments list, bearer vs primary persisted, relay/ssh metadata).
- `resolver.ts` / `presentation.ts` (resolve one access endpoint per environment, treat `AdvertisedEndpoint` as hints, probe reachability before UI claims success).
- `authorization/remote.ts` (browser pairing hash handling) wired to hosted app if deployed.

Exit criteria:

- Kill Wi-Fi → app shows offline, reconnects with backoff on restore; no manual refresh needed.
- Version skew shows `Settings → Connections` banner (advertised `serverVersion` vs client, `docs/internals/remote.md:216-221`).

### M3 — Mobile scaffold (5–7 days) — thin client ships to TestFlight internal

Goal: Expo iOS+Android app that can browse threads and continue chats against any paired environment. No preview yet.

Stack (mirror `t3code/apps/mobile/package.json:45-121`, adapt to Caide):

- `expo ~56.0.12`, `react-native 0.85.3`, `react 19.2.3`, `react-native-reanimated 4.3`, `react-native-gesture-handler`, `react-native-safe-area-context`, `@react-navigation/native-stack 7.17`, `expo-secure-store`, `expo-sqlite`, `expo-network`, `expo-camera` (QR), `expo-image-picker`, `expo-notifications`, `expo-widgets`, `expo-sharing`, `expo-quick-actions`, `uniwind` (Tailwind 4), `@effect/atom-react 4.0-beta.103`, `effect 4.0-beta.103`, `e2e`-par with `packages/client-runtime`.
- `apps/mobile/app.config.ts` (template from `t3code/apps/mobile/app.config.ts:59-373`):
  - 3 variants `development|preview|production` → `name T3 Code Dev/caide-dev` → `Caide Dev/Preview/Caide`, schemes `caide-dev/caide-preview/caide`, bundles `com.caide.mobile.dev/preview/com.caide.mobile`, OTA `https://u.expo.dev/<new-project>` with `runtimeVersion policy fingerprint` (`MOBILE_VERSION_POLICY=fingerprint`), plugins `expo-secure-store`, `expo-sqlite`, `expo-camera`, `expo-notifications`, `expo-sharing` (text+webUrl+8 images), `expo-widgets` (`AgentActivity` `systemSmall/Medium/accessoryRectangular`+`frequentUpdates:true`), `expo-quick-actions`.
- `pnpm` not required: keep Caide `bun` workspaces (`package.json:workspaces`) + add patches for RN deps mirroring `t3code/pnpm-workspace.yaml:126-141` (screens/gesture-handler/list/widget).
- Navigation (`apps/mobile/src/Stack.tsx:446-657` template):
  - Flat `RootStack` (no nested `UINavigationController`): `Home`, `Thread threads/:environmentId/:threadId`, `ThreadTerminal .../terminal`, `ThreadReview .../review`, `ThreadFiles .../files`, `ThreadFile .../files/:path*`, Sheets (`GitOverview/Commit/Branches`, `SettingsSheet` nested, `NewTaskSheet`, `Connections/ConnectionsNew`). `AdaptiveWorkspaceLayout`, `ThreadOutboxDrainWorker` null leaf, `IncomingShareProvider`, `HardwareKeyboardCommandProvider`.
- Screens v1 (copy `t3code/apps/mobile/src/features/*` 20 dirs, trim):
  - `home` (project list via `subscribeShell`), `threads` (feed + composer + slash-skill search `composerSlashSkillSearch.ts`, pending approvals `PendingApprovalCard`, user-input `PendingUserInputCard`, live-follow `thread-feed-live-follow.ts`, work-log, git controls), `connection` (add environment: QR scan or host+token), `settings` (appearance, environments, auth), `agent-awareness` (read-only status).
- Platform wiring: `apps/mobile/src/connection/runtime.ts` mirrors `apps/web/src/connection/runtime.ts` with `Platform` layer for secure-store/sqlite/network/background.
- Assets: `scripts/lib/brand-assets.ts` → `BRAND_ASSET_PATHS` per variant, `global.css` `uniwind`, DM Sans fonts.
- EAS: `apps/mobile/eas.json` channels `development/preview/production`, `distribution internal` for dev/preview, `autoIncrement true` prod, `ascAppId`/`track internal` when packaging.

Exit criteria:

- `bun --cwd apps/mobile typecheck` + device `expo start --clear` on LAN reaches local dev server pairing.
- Home lists real projects/threads via `subscribeShell`; Thread opens streaming transcript; Composer sends turn, streams deltas, survives background→foreground without duplicate messages.
- Internal `eas build --profile preview` TestFlight/Internal Track succeeds.

### M4 — Chat continuations, monitoring, notifications (5–7 days)

Goal: phone is actually useful for steering agents remotely.

- Continuations:
  - `ProviderService.sendTurn/steerTurn/interruptTurn/respondToRequest` `apps/server/src/provider/Services/ProviderService.ts:58-231` — optimistic `pendingTurnDispatch.ts`, `useSmoothStreamedText`, mode toggles (`default|plan|debug` → Codex `ApprovalPolicy/SandboxMode`). Recycle `pendingInteractionDerivation.ts` for web parity.
  - Background resilience: iOS `expo-task-manager` + APNs keepalive, Android `HeadlessJs`; `supervisor.ts` replays from `lastSequence` on reconnect; `DrainableWorker` `drain()` keeps event ordering.
- Monitoring:
  - `observability/` + `resourceTelemetry/` + `native/resource-monitor` (Rust `cargo build --locked --release --manifest-path native/resource-monitor/Cargo.toml` pattern) → RPC `resourceTelemetry.subscribe` streamed to `features/observability` (CPU/mem/queue depth).
  - Checklist-style gate: audit GPU spikes (no continuously repainting animations, `AGENTS.md:149` taste rule).
- Notifications + widgets:
  - `expo-notifications` (`app.config.ts:267-274` pattern) — server receipts (`RuntimeReceiptBus` → `ProviderRuntimeIngestion`/`CheckpointReactor`) trigger Expo Push when turn enters `waiting` (approval/question) or settles `completed|failed|cancelled|aborted`. Deep-link `caide://threads/:env/:thread` via `useAgentNotificationNavigation` + `notificationNavigation.ts`.
  - `expo-widgets` `AgentActivity` (`app.config.ts:111-129`) updates via AppGroup frequently.
- Files/terminal/git interleaved:
  - `ThreadFilesTreeScreen` + `ThreadTerminalRouteScreen` (`terminal.attach` stream) + `GitOverviewSheet/CommitSheet/BranchesSheet` — ensure each screen uses `threadId` keyed data so two chats in one project never cross streams (001 isolation invariant `001:83-89`).

Exit criteria:

- With app killed, approval requested → push arrives, tap lands on waiting turn, respond resumes same turn (no new thread).
- Two threads in same project run concurrently; terminal/git/files stay bound to owning thread (no cross-project state).

### M5 — Previews & builds on mobile (4–6 days)

Goal: see what the agent built, without being on the desktop.

- Use existing `dyadRuntime/frameworkRegistry.ts:91-96` routing:
  - `blank` → explicit unavailable state, no engine start.
  - `website` + `react-native` (Expo web) → browser dev-server preview path (`DevServerManager` + `wsPreviewHandlers`) served via server proxy `GET /api/local-image` `http.ts:317-320`, rendered in `react-native-webview` (not direct localhost). `BrowserPanel.tsx` parity.
  - `flutter` → emulator/iOS Simulator + `flutter pub/analyze/test` via `EngineAdapter` preview ops `EngineAdapter.ts:40-123` (`previewStart/Stop/Reload/State/Analyze/Test/Build/Screenshot/Devices/Toolchain`). Initially poll `previewScreenshot` every 2s for phone; device video stream is later.
- Build artifacts:
  - `website` `npm run build` → `.tar.gz` artifact; `react-native` `expo prebuild` + `assembleRelease/bundleRelease` → APK/AAB; `flutter` APK/AAB/IPA where toolchain present (`001:372-382`). Mobile `ReviewSheet` + artifacts list renders download links via `ManagedAttachmentStore`.
- Security: `rejectCareerSuppliedPaths` — preview/build APIs resolve workspace server-side from `projectId` (`wsDatabaseHandlers.isolation.test.ts` pattern); never trust client path.

Exit criteria:

- Website "hey" in agent mode → preview screenshot updates after dev-server restart; React Native website preview same surface with native prompts; Flutter blank shows unavailable copy (001 Handoff).
- Build controls trigger correct target per framework; artifact list survives restart.

### M6 — Tunnels & SSH polish (optional but exponential) (4–6 days)

Goal: reach hosts behind NAT/without open ports, and reuse remote machines via SSH.

- Relay (`RelayConnectionTarget`):
  - Cloudflare Worker + managed tunnel hostname (T3 model `docs/internals/remote.md:143-150`, `docs/internals/t3-connect.md`): Worker brokers credentials + hostname, traffic flows over tunnel hostname not Worker. Alternative quick-win: self-host `bore`/`rathole` tunnel provider using same `AdvertisedEndpoint` provider interface + `Relay` protocol `packages/contracts/src/relay.ts`.
  - Desktop: `t3 connect link`-style publish for local environment; mobile just pairs bearer to managed hostname.
- SSH (`SshConnectionTarget`, desktop-only):
  - Copy `packages/ssh/src/tunnel.ts` (`SshEnvironmentManager`: resolve target, launch/reuse remote `caide`, forward loopback port, HTTP readiness, optional pairing) + `apps/desktop/src/ssh/DesktopSshEnvironment.ts` (`discoverHosts` via `~/.ssh/config`+`known_hosts`, askpass, launcher script `~/.caide/ssh-launch/<host-key>/`, `sh -lc "command -v node && node --version"` probe `docs/user/remote-access.md:154-167`). Renderer connects through forwarded URL.
- Richer multi-environment UX (`docs/internals/remote.md:228-230` future: third-party tunnels, relay OAuth, environment list filtering). Before calling done, walk `AGENTS.md:67-73` "hit every surface": entry points (Settings palette keybinding), all three clients, all providers, contracts, reverse states (disconnect/re-register), docs (`docs/user/remote-access.md` companion for Caide).

Exit criteria:

- Machine behind NAT reachable via relay hostname without router changes; SSH launch from desktop survives reconnect after app update (clear PID/port state, compare runner script, stop stale server — `docs/user/remote-access.md:168`).

---

## 5. Master Todo list (copy into issues or `gh project`)

Check off top to bottom; milestones gate on sub-bullets.

### M0 — Foundation

- [ ] Add `packages/client-runtime` package (scaffold `package.json`, `tsconfig.json`, `src/connection/**`)
- [ ] Copy `t3code/packages/client-runtime/src/connection/{model,catalog,driver,supervisor,resolver,credentialStore,profileStore,wakeups}` (adapt imports)
- [ ] Add `Platform` abstraction (`SecureStore`, `Sqlite`, `Network`, `BackgroundTask`)
- [ ] Create `packages/contracts/src/rpc.ts` `WsRpcGroup` (streaming `subscribeShell/thread`, `terminal.attach`, `subscribeServerConfig`)
- [ ] Server: implement `websocketRpcRouteLayer` `apps/server/src/ws.ts` pattern + `RPC_REQUIRED_SCOPE` per-method auth
- [ ] Server: add `ExecutionEnvironment` `environment-id` file + `GET /api/environment` + `environment.getAdvertisedEndpoints`
- [ ] Server: keep dual WS until cutover, then compress only feature socket (`nodeHttpServer.ts:49-60`)
- [ ] Web: wire `apps/web/src/connection/runtime.ts` to `RpcSessionFactory` (supervisor retries, not session)
- [ ] Tests: `packages/client-runtime/test`, `apps/server/test/ws.test.ts` for new RPC path
- [ ] Verify: web connects, subscribed shell/thread streams, version banner works

### M1 — Pairing & remote access

- [ ] Add `SessionStore` `DEFAULT_WEBSOCKET_TOKEN_TTL=5min` + `EnvironmentAuth.issueWebSocketTicket`
- [ ] Add `POST /api/auth/websocket-ticket` (bearer header in, ticket out) + WS `?wsTicket=` verify
- [ ] Keep `POST /api/auth/bootstrap|/bearer` + `stripPairingTokenFromUrl` for bootstrap; block `?token=` non-loopback
- [ ] CLI: `apps/server/src/bin.ts` `pair` subcommand + `cliAuthFormat` QR (`qrcode`), flags `--tailscale`, `--tailscale-serve-port`, `--ttl`, `--base-dir`
- [ ] Desktop: `apps/desktop/src/backend/caideEndpointProvider.ts` + Settings → Connections UI (Network access toggle, default endpoint, `+N`, `Create Link` + QR, `selectPairingEndpoint` priority)
- [ ] Packages: add `@caide/tailscale` (`ensureTailscaleServe/disableTailscaleServe`) + server setting `tailscaleServeEnabled`
- [ ] Hosted pairing: `packages/shared/src/remote.ts` + `apps/web/src/hostedPairing.ts` `pair?host=...#token=` flow
- [ ] Docs: `docs/user/remote-access.md` (Caide version of `t3code/docs/user/remote-access.md`)
- [ ] Manual: LAN pairing, Tailscale HTTPS pairing, hosted pairing matrix green
- [ ] Commit + tag `m1-pairing`

### M2 — Client runtime harden

- [ ] Harden `connection/supervisor.ts` (exponential backoff, offline, wakeup)
- [ ] Persist environments: `credentialStore.ts` + `profileStore.ts` (bearer/primary/relay/ssh)
- [ ] Implement `resolver.ts` / `presentation.ts` endpoint resolution + probe before success
- [ ] Wire `authorization/remote.ts` hash handling for hosted app builds
- [ ] Tests: `supervisor.test.ts`, `resolver.test.ts`, `onboarding.test.ts` (copy T3 fixtures, adapt)
- [ ] Manual: kill Wi-Fi → offline → backoff reconnect → resume stream intact

### M3 — Mobile scaffold

- [ ] Scaffold `apps/mobile` (`app.config.ts` 3 variants, `eas.json`, `global.css`, `uniwind`, DM Sans)
- [ ] Add patches for RN deps (mirror `t3code/pnpm-workspace.yaml:126-141` patches for screens/gesture-handler)
- [ ] Copy `apps/mobile/src/{App.tsx,Stack.tsx}` + `features/layout/AdaptiveWorkspaceLayout` + `Stack.tsx:WORKSPACE_OVERLAY_ROUTES` flat stack
- [ ] Implement `apps/mobile/src/connection/runtime.ts` platform layer (`expo-secure-store`+`expo-sqlite`+`expo-network`)
- [ ] Features v1: `home` (subscribeShell), `threads` (feed/composer/slash-skills, pending cards, live-follow), `connection` (QR/`host+token`), `settings` (appearance, environments), `agent-awareness`
- [ ] Wire `packages/client-runtime` + `packages/contracts` workspace deps + `effect`/`@effect/atom-react`/`@legendapp/list`/`reanimated`
- [ ] Assets + branding per variant (`scripts/lib/brand-assets.ts`)
- [ ] Verify: `bun --cwd apps/mobile typecheck`, LAN `expo start --clear` reaches dev server
- [ ] Build: `eas build --profile preview` TestFlight Internal green
- [ ] Commit + tag `m3-mobile-scaffold`

### M4 — Continuations & monitoring

- [ ] Chat continuations: wire `sendTurn/steerTurn/interruptTurn/respondToRequest` + optimistic dispatch + smooth deltas + mode toggles
- [ ] Background: iOS `expo-task-manager` + Android `HeadlessJs` + `supervisor` replay from `lastSequence`
- [ ] Resource telemetry: `observability/` + `resourceTelemetry/` + Rust monitor → `resourceTelemetry.subscribe` → `features/observability`
- [ ] Notifications: `expo-notifications` push on `waiting`/terminal + deep-link `caide://threads/:env/:thread`
- [ ] Widgets: `expo-widgets` `AgentActivity` via AppGroup `frequentUpdates:true`
- [ ] Files/terminal/git bound to `threadId` (001 isolation invariant guard)
- [ ] Manual: killed-app approval → push → tap resumes same turn; two threads concurrent without cross-leak

### M5 — Previews & builds

- [ ] Route `blank` unavailable; `website`/`react-native` → `DevServerManager` + `react-native-webview` via `/api/local-image` proxy (not localhost)
- [ ] Route `flutter` → device tooling + `previewScreenshot` polling (2s) as v1
- [ ] Build artifacts: website `tar.gz`, RN `expo prebuild`+Gradle APK/AAB, Flutter APK/AAB/IPA where toolchain ready
- [ ] Security: server-resolve workspace from `projectId`, reject client-supplied paths (isolation test)
- [ ] Publish `ReviewSheet` + artifacts list on mobile
- [ ] Manual: each framework preview + build per `001:417-425` acceptance matrix

### M6 — Tunnels & SSH (optional exponential)

- [ ] Relay provider: Worker + tunnel hostname (or `bore` adapter) + `RelayConnectionTarget` persist
- [ ] SSH: `packages/ssh/tunnel.ts` + `apps/desktop/src/ssh/DesktopSshEnvironment.ts` (discover, probe `sh -lc`, launch script, forward port, readiness)
- [ ] Desktop publish: `connect link`-style local relay publish (optional; mobile caller is unchanged)
- [ ] Docs: update `docs/user/remote-access.md` + `docs/internals/remote.md` (Caide instance) for relay/ssh paths
- [ ] Manual: NAT-host via relay; SSH launch survive app update; `AGENTS.md:67-73` "hit every surface" checklist
- [ ] Release: `dist:desktop:*` + mobile production `eas build` + notes

---

## 6. File map (where the work lands)

```
packages/client-runtime/                 NEW — copied from t3code/packages/client-runtime
packages/contracts/src/rpc.ts            NEW — WsRpcGroup (effect RPC)
packages/tailscale/                      NEW — ensureTailscaleServe (from t3code/packages/tailscale)
packages/ssh/                            NEW (M6) — tunnel.ts (from t3code/packages/ssh)
packages/shared/src/remote.ts            NEW — set/get/stripPairingToken

apps/server/src/
  ws.ts                                  NEW — websocketRpcRouteLayer
  auth/SessionStore.ts                   EDIT — websocket ticket TTL
  auth/Services/EnvironmentAuth.ts       EDIT — issueWebSocketTicket
  environment/ServerEnvironment.ts       NEW — environment-id
  server.ts                              EDIT — tailscale serve acquire (M1)
  bin.ts                                 EDIT — pair subcommand
  http.ts                                EDIT — /api/auth/websocket-ticket, /api/environment

apps/web/src/
  connection/runtime.ts                  EDIT — RpcSessionFactory + supervisor
  hostedPairing.ts                       NEW
  components/settings/ConnectionsSettings.tsx EDIT — selectPairingEndpoint

apps/desktop/src/
  backend/caideEndpointProvider.ts       NEW — AdvertisedEndpoint provider
  ssh/DesktopSshEnvironment.ts           NEW (M6)

apps/mobile/                             NEW — Expo app (see M3 checklist)
  app.config.ts
  eas.json
  src/{App.tsx,Stack.tsx,connection/runtime.ts,features/**,state/**}
```

---

## 7. How to start (anytime resume)

1. Ensure `001` is at least M1 (framework column + embedded runtime) — `git log --oneline -20` should show `embedded.mjs` staging + `ProjectFramework` contract.
2. Checkout a feature branch from `feature/backend-transplant` (or `main` if merged):
   ```bash
   git checkout -b feature/mobile-remote
   git status            # must be clean — AGENTS rule 2
   ```
3. Run M0 exactly as listed; after M0 commit:
   ```bash
   bun run typecheck
   bun run test
   git add packages/client-runtime packages/contracts apps/server apps/web
   git commit -m "feat(remote): M0 client-runtime + Effect RPC + environment identity"
   ```
4. After M1, smoke remote from phone on LAN before any mobile code:
   ```bash
   bun run build
   TOKEN="$(openssl rand -hex 24)"
   bun run --cwd apps/server start -- --host 0.0.0.0 --port 3773 --auth-token "$TOKEN" --no-browser
   # then in another shell:
   bun run --cwd apps/server start -- pair   # scan QR from phone browser
   ```
5. Tailscale smoke: `tailscale ip -4`, restart with `--host "$(tailscale ip -4)"` or toggle in desktop, then `pair --tailscale`.
6. Continue M2→M6 in order; never open `VITE_HTTP_URL`/`VITE_WS_URL` for dev (bakes localhost, breaks remote — `t3code/AGENTS.md:63`). Read real ports from `[dev-runner]` line.

---

## 8. Success criteria

- Phone on LAN scans `caide pair` QR → same shell/thread list as desktop, chat continuation works, approvals bubble to phone.
- Wi-Fi drop + restore resumes streams; push delivers `waiting` event while app killed.
- Preview screenshot renders for website/RN web; flutter blank shows unavailable copy.
- Builds route by framework and produce correct artifacts.
- `AGENTS.md:67-73` checklist: every feature reachable from chat view + palette + keybinding, on web/desktop/mobile, across loopback/bearer/relay/ssh, with reverse paths (snooze↔unsnooze, close↔reopen), contracts updated, docs landed.

---

## 9. References

- T3 internals: `t3code/docs/internals/overview.md`, `t3code/docs/internals/remote.md`, `t3code/docs/internals/connection-runtime.md`, `t3code/docs/internals/glossary.md`
- T3 user flows: `t3code/docs/user/remote-access.md`, `t3code/docs/user/updating.md`
- T3 code to mirror: `t3code/apps/mobile/app.config.ts:59-373`, `t3code/apps/mobile/src/Stack.tsx:446-657`, `t3code/packages/client-runtime/src/connection/*`, `t3code/apps/server/src/ws.ts`
- Caide current: `Caide-final/REMOTE.md`, `Caide-final/apps/server/src/config.ts:43-67`, `Caide-final/apps/server/src/nodeHttpServer.ts:76,114-221`, `Caide-final/plans/001-dyad-backend-rebuild.md:11-530`, `Caide-final/AGENTS.md:67-73`
- Solo invariants: `001:83-89` project/chat/thread security boundaries, `AGENTS.md:144-150` taste (no repainting animations, inferred types, complexity at adapter).

---

## 10. Non-goals (keep scope tight)

- Do not rewrite web UI before mobile ships. Preserve `ChatView/MessagesTimeline/composer/plan/approval` wiring; rebind data (001:204-210) rather than redesign.
- Do not introduce custom crypto. Reuse T3's DPoP/bearer + 5min ticket pattern verbatim.
- Do not block M3 on relay. LAN + Tailscale unbuckle 90% of remote value.
