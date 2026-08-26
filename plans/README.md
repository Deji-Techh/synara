# Active Implementation Plans

- [`001-dyad-backend-rebuild.md`](./001-dyad-backend-rebuild.md) — integrated dyad backend (IN PROGRESS, branch `feature/backend-transplant`)
- [`002-mobile-remote-connection.md`](./002-mobile-remote-connection.md) — mobile app remote connections, chat continuations, monitoring, previews (READY, depends on 001 M1)

All superseded numbered plans were removed on 2026-08-24. Every implementation
session must read the active plan(s) from top to bottom before changing code and
must update its handoff log and checklist after each meaningful change. `001`
and `002` share `apps/server` / orchestration / dyad runtime — coordinate
branching from `feature/backend-transplant` until 001 merges.
