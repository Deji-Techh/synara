# 011 — Preview system: proxy, tunnel, console, visual edit, device, release

## 0. Goal

V1's preview depth behind V2's PreviewStage/dock chrome. V2's per-thread,
per-framework (`blank` none / flutter device / website iframe / RN expo-web)
lifecycle stays; V1's missing planes are ported in. Never target the unwired legacy
`PreviewPanel.tsx` — extend `PreviewStage` branches or dock panes (017).

## 1. Proxy + injection plane (critical)

- Port `worker/proxy_server.js`: zero-dep HTTP/WS forwarder (Host/Origin rewrite,
  `SameSite=None;Secure` cookie fix, WS upgrade tunneling, fallback ports) +
  injected clients (error shim, component selector, screenshot, visual editor,
  log forwarder, SW). No V2 equivalent exists — this unblocks visual editing,
  screenshots, log capture.

## 2. Tunnel + worldwide sharing (critical)

- Port the tunnel CLIENT against the vendored `preview-control-plane` relay
  (control WS + REST + secondary WS). V2 defers this — undefer it.
- Three sharing modes (LAN QR [keep V2] / Worldwide / Live) with expiring URLs,
  `preparing/live/syncing/failed` states, 5s polls, refresh/retry/copy/open;
  upload path reuses providers + secret-path filter + watcher resync (016).
- QR popup gains the mode switch; resulting URLs surface back into `publish` (017).

## 3. Console, problems, tests, security, configure

- **Console tab:** typed sources (server/client/edge/network) × level filters,
  virtualized list, per-source search, clear, click-to-AI. Engine ring → `server`,
  iframe errors → `client`.
- **Loading screen:** session-boundary logs + error taxonomy (`dyad-app/dyad-sync/
  preview-app`) + actionable banner (Rebuild / Fix-with-AI, `MAX_ERRORS_FOR_AI_FIX=10`).
- **Package-manager banner:** pnpm-migration/release-age + one-click fix + Node guard.
- **Problems:** checklist + fix-selected (batched `createProblemFixPrompt`, incl.
  TS-vs-UI-quality framing).
- **Tests:** Playwright spec discovery/run/stop, per-file/case results, screenshots,
  `<dyad-generate-test>` round-trip (website framework); keep `flutter test` summary.
- **Security:** findings list + severity + file peek + AI-fix → new `security` dock
  pane (017); interim PR-panel Checks tab.
- **Configure:** custom install/start commands, env CRUD, Neon/Supabase connectors →
  extend `ProjectPanel` with Run-&-environment section.
- Wire the stubbed `routes/preview.ts` / `routes/verify.ts` + `runQualityCommand`
  through `preview.analyze/test` instead of leaving no-ops.

## 4. Visual editing + bridge (signature capability)

- `dyad-*` iframe bridge (component select/styles/text-edit/screenshot/overlays/
  pro-mode toggle — gate dropped, free).
- Visual-editing toolbar (font/colour/spacing, image-swap) + pending-changes dialog
  → new `visual-edit` dock pane + `PreviewStage` select branch (017).
- Screenshot annotator (draw/text/select/undo/redo) → `PreviewStage` Annotate branch.
- Plan selection comments: see 017 handoff (quote-prefix), not here.

## 5. Device, native builds, release

- Wire the transplanted `devicePresets.ts` table into the frame picker
  (`DEVICE_PRESETS_ARRAY`) + Simulate branch (safe-area/keyboard/dark/offline/
  text-scale first). Keep `DevicePanel` (iOS Simulator) separate from web DeviceLab.
- Capacitor controls (sync/build/install/keystore/Play-deploy) + **managed Android
  toolchain** (pinned JDK 21 / cmdline-tools / progress) + staged release
  (signing ceremony, store ship) → flesh out the `release` tab with pipeline stepper.
- `QualityGatePipeline` staged gates → `qualityGate` tab stepper.
- File save queue + hidden-file filter + preview prefs/buffer/sizing ported;
  `NoAppSelected`/empty states map to `PanelStateMessage`.

## 6. Acceptance

- Click element → edit style/text/image → save, via the bridge, on website preview.
- Console shows interleaved server/client/edge/network with filters.
- Worldwide share link opens outside LAN; LAN QR still works.
- `flutter build`/Capacitor path produces installable artifacts (016 toolchain).
- Playwright tests run per-spec with AI-fix; security findings listed with fixes.
