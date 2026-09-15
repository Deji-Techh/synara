# Active Implementation Plans — V1-backend / V2-UI convergence

Branch: `feature/v1-backend-v2-ui`. Mission: V2 UI pixel-exact + V1 backend faithful,
everything free, English-only. (Old plans 001–006 deleted.)

- [`007-master-v1-backend-transplant.md`](./007-master-v1-backend-transplant.md) — **MASTER**: mission, boundary, transport law, de-Pro policy, phases, fix-in-transit + wont-port ledgers
- [`008-agent-core.md`](./008-agent-core.md) — turn engine, modes, consent, tool loop, cancel chain
- [`009-providers-models.md`](./009-providers-models.md) — catalog, routing, keys, auth, custom/local models
- [`010-persistence.md`](./010-persistence.md) — threads, versions, memory, compaction, goals engine
- [`011-preview-system.md`](./011-preview-system.md) — proxy, tunnel, console, visual editing, device, release
- [`012-publish-deploy-share.md`](./012-publish-deploy-share.md) — GitHub/Vercel, Neon sync, packages, collaboration
- [`013-mcp-integrations.md`](./013-mcp-integrations.md) — MCP registry/OAuth, Supabase, Neon, add-integration
- [`014-knowledge-chatpower.md`](./014-knowledge-chatpower.md) — skills, prompts library, queue, tabs, cards, image-gen, theme-gen, help bot
- [`015-shell-platform.md`](./015-shell-platform.md) — deep-links, dialogs, safeStorage, first-run, notifications
- [`016-services-workers-scaffolds.md`](./016-services-workers-scaffolds.md) — backend services, workers, scaffolds, test strategy
- [`017-ui-homes.md`](./017-ui-homes.md) — right-dock / Context-card / composer catalog + plan→agent handoff spec
- [`018-settings-reconciliation.md`](./018-settings-reconciliation.md) — settings add/remove/replace + sync map

Every session reads `AGENTS.md` + `007` first, then the domain plan(s) in scope.
Commit after every milestone: `bun fmt` + `bun lint` + `bun typecheck` (one bundled pass),
`bun run test` (never `bun test`).
