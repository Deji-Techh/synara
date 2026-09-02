# Caide

Caide is a local-first desktop and web workspace for building production apps with the AI agents and subscriptions you already use. It brings chats, provider sessions, tool execution, preview, and builds into a single focused window so you can run agent work without juggling multiple tools.

> **Status: very early WIP.** Active development is on branch `feature/backend-transplant` (see `plans/001-dyad-backend-rebuild.md`). Expect breaking changes.

![Caide app showing parallel agent threads, terminal output, and project navigation](assets/prod/readme-screenshot.jpeg)

## What Caide does

- Use the AI accounts you already pay for. Provider sessions are brokered through the server and streamed to the web UI via WebSocket.
- Create immutable-framework projects: **Blank**, **React Native (Expo)**, **Flutter**, or **Website (Vite / Next.js)**. Framework choice controls scaffolding, prompts, tools, preview, and build artifacts.
- Run parallel work across projects and chats. Strict project/chat isolation ensures no messages, streams, tools, approvals, previews, or artifacts cross ownership boundaries.
- Stream agent output with delivery-mode aware ingestion: message deltas, snapshots, tool calls, todos, approvals, and questionnaire interactions.
- Review and approve app blueprints and questionnaire cards inline before the agent continues implementation.
- Preview and build per framework: browser dev-server for Website and React Native (Expo web), Flutter toolchain preview and APK/AAB/IPA where the local toolchain supports it, and explicit unavailable state for Blank.

## Product mission

Caide's desktop shell and web UI remain the product surface. The backend is being rebuilt around the proven `dyad x caide` runtime integrated into `apps/server`. The end state is Caide's current UI/UX backed by the complete dyad runtime, with reliable chat, streaming, approvals, tools, modes, compaction, MCP, goals, and framework-aware preview and builds.

Locked decisions:

1. One immutable framework per project, chosen at creation. Chats inherit the framework.
2. Framework controls prompts, skills, tools, dependencies, preview adapter, and release artifacts.
3. Fresh runtime state. No conversation migration is required from the old orchestration store.
4. Dyad runtime runs inside `apps/server`. No child-engine stdio supervision in the final architecture.

Details are in `plans/001-dyad-backend-rebuild.md` and `AGENTS.md`.

## Architecture

```
Caide-final/
  apps/
    desktop/     Electron shell and packaging (electron-builder)
    engine/      Flutter Builder engine bundle — agent loop, tools, preview, SQLite, prompts
    server/      Node WebSocket server — hosts dyad runtime, brokers Codex app-server, serves web app
    web/         React/Vite UI — session UX, transcript, composer, preview
  packages/
    contracts/   Shared Effect/Schema schemas — provider events, WebSocket protocol, model/session types
    shared/      Shared runtime utilities (subpath exports, e.g. @caide/shared/git)
  scripts/       Dev runner, desktop artifact builder, engine payload staging
```

### Package roles

| Package              | Role                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/engine`        | Standalone Node process. Agent loop rebuilt from `local_agent_handler.ts`, Flutter tooling, preview runtime, SQLite. Owns workspace files via `EmbeddedEngineClient`.          |
| `apps/server`        | Wraps `codex app-server` (JSON-RPC over stdio), manages provider sessions in `codexAppServerManager.ts` / `providerManager.ts`, routes WebSocket `NativeApi` in `wsServer.ts`. |
| `apps/web`           | Consumes `orchestration.domainEvent` over WebSocket, renders transcript, composer, blueprint/questionnaire cards, preview.                                                     |
| `packages/contracts` | Schema-only. No runtime logic.                                                                                                                                                 |
| `packages/shared`    | Runtime helpers consumed by server and web.                                                                                                                                    |

### Framework registry

Defined in `apps/server` and `apps/engine` framework constants. Each framework supplies scaffold handler, system prompt additions, enabled tools, package commands, preview adapter, and build actions.

- **Blank** — Empty managed directory. Agent chooses implementation later. Preview/build unavailable until workspace is recognizable.
- **React Native** — Expo/React Native prompts, Metro dev-server, browser preview for Expo web, native build targets.
- **Flutter** — Dart/Flutter prompts and skills, `flutter pub`, `flutter analyze`, `flutter test`, device preview, APK/AAB/IPA.
- **Website** — Vite/Next.js scaffolding, browser preview, `npm run build` archived as `.tar.gz` artifact.

## Requirements

- Bun `^1.3.12` (see `packageManager` in `package.json`)
- Node `^24.13.1`
- For Flutter projects: Flutter SDK, Android SDK / Xcode as needed
- For Codex provider: `codex` CLI installed and authenticated

## Quick start

```sh
bun install
bun run dev
```

This starts the server and web app. The web UI connects to the server over WebSocket. The server spawns `codex app-server` per provider session.

### Isolated dev instance

When another Caide instance is already running, use an isolated home dir and port offset:

```sh
env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 bun run dev -- --home-dir ./.caide-dev --port 58090 --dry-run
env -u CAIDE_AUTH_TOKEN CAIDE_PORT_OFFSET=3158 CAIDE_NO_BROWSER=1 bun run dev -- --home-dir ./.caide-dev --port 58090
```

Check for port conflicts:

```sh
lsof -nP -iTCP:58090 -sTCP:LISTEN
lsof -nP -iTCP:58091 -sTCP:LISTEN
```

If the UI shows no threads, verify the isolated `state.sqlite` and probe `orchestration.getSnapshot` over WebSocket before changing SQL.

## Building the desktop app

```sh
node scripts/build-desktop-artifact.ts --platform linux --target AppImage --arch x64
node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64
node scripts/build-desktop-artifact.ts --platform win --target nsis --arch x64
```

Output lands in `release/` (e.g. `release/Caide-0.0.1-x86_64.AppImage`). Fully quit and relaunch the installed app to pick up changes. Logs for the packaged app are at `~/.caide/userdata/logs/server.log` and `server-child.log`.

Engine payload staging builds a self-contained `apps/engine/dist/index.mjs` plus `node_modules` for Better SQLite and `node-pty` via `scripts/lib/stage-engine-payload.ts`.

## Codex App Server

Caide is Codex-first. The server starts `codex app-server` per provider session (JSON-RPC over stdio) and projects activity into orchestration events.

- Session lifecycle: `apps/server/src/codexAppServerManager.ts`
- Provider dispatch: `apps/server/src/providerManager.ts`
- WebSocket routing: `apps/server/src/wsServer.ts`
- Web consumption: `orchestration.domainEvent` push channel

Docs: https://developers.openai.com/codex/sdk/#app-server

Reference implementations:

- Codex: https://github.com/openai/codex
- CodexMonitor (Tauri): https://github.com/Dimillian/CodexMonitor

## Project structure notes

- System prompts: `apps/engine/src/prompts/` — `system_prompt.ts`, `local_agent_prompt.ts`, `plan_mode_prompt.ts`, `ai_rules.ts`
- Agent tools: `apps/engine/src/pro/main/ipc/handlers/local_agent/tools/`
- Chat handlers: `apps/engine/src/ipc/handlers/chat_stream_handlers.ts`
- Blueprint handlers: `apps/engine/src/ipc/handlers/app_blueprint_handlers.ts`
- Provider adapter: `apps/server/src/provider/Layers/EngineAdapter.ts`
- Ingestion: `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- Web cards: `apps/web/src/components/chat/CaideQuestionnaireCard.tsx`, `CaideAppBlueprintCard.tsx`, `CaideBlueprintApprovalPanel.tsx`

## Scripts

| Script                                   | Purpose                           |
| ---------------------------------------- | --------------------------------- |
| `bun run dev`                            | Start server + web                |
| `bun run typecheck`                      | Turbo typecheck across workspaces |
| `bun run lint`                           | Oxlint                            |
| `bun run fmt`                            | Oxfmt                             |
| `bun run test`                           | Vitest (never `bun test`)         |
| `node scripts/build-desktop-artifact.ts` | Build desktop artifact            |

Do not run `bun fmt`, `bun lint`, or `bun typecheck` unless explicitly requested. When they are required, run them together as a single final verification pass.

## Disclosure motion

Any open/close toggle (expand/collapse, show/hide) must reuse `apps/web/src/lib/disclosureMotion.ts` — `disclosureShellClassName`, `DISCLOSURE_INNER_CLASS`, `disclosureContentClassName`, or `DisclosureRegion`. Base UI `Collapsible` panels use `CollapsiblePanel`. Chevron affordance uses `DisclosureChevron`.

Reference: `apps/web/src/components/Sidebar.tsx`.

## Configuration

- App projects: `~/caide-apps` by default (resolved via `getCaideAppPath`)
- Desktop user data: `~/.caide/userdata/`
- Engine SQLite: `apps/server/userData/engine/sqlite.db` (dev) or packaged `resources/engine/`
- Settings: `apps/engine/src/main/settings.ts`, `apps/engine/src/lib/schemas.ts`

## Contributing

Read `CONTRIBUTING.md` before opening an issue or PR. This repository is very early. Focused bug fixes, reliability improvements, and small maintenance PRs are most welcome.

Need support? Open an issue at `https://github.com/Deji-Techh/caide-final/issues`.

## Origins

Caide began as a clone of [T3Code](https://github.com/pingdotgg/t3code) and has since diverged substantially with its own branding, packaging, release system, provider orchestration, and product direction.

## License

See `LICENSE` if present. Otherwise assume all rights reserved until a license is added.
