# Motion as First-Class Generation

## Purpose
Motion is not a polish line item — it's a generation discipline. The biggest gap between "AI-built app" and "app built by a team that cares about feel" is motion. This skill teaches the Builder to generate timing curves, gesture interactions, and haptic feedback mapped to specific actions.

## Rules
- **Timing curves:** Use `disclosureMotion.ts` 220ms ease-out for all open/close toggles. Never bespoke transitions.
- **Haptics:** Map to actions — success via light impact, error via medium, selection via selection feedback. Not all actions need haptics.
- **Gestures:** Swipe-to-dismiss on modals, pull-to-refresh on lists, long-press for context menus.
- **Stagger:** List items stagger 30-50ms apart. Never all-at-once.
- **Reduced motion:** Always check `prefers-reduced-motion: reduce` — disable animations, use instant state changes.

## Token rules
- `var(--foreground)` for text elements
- `var(--color-text-accent)` for accent motion (brand mark, active nav)
- `var(--secondary)` for background transitions
- `var(--border)` for border animations
