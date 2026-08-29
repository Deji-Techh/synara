# Spec — Example Caide App (M1 gate)

## Who
Mobile-first users who need to create and share lists quickly.

## Core Flows (3, not features)
1. **Sign up → Create item → Share item** — new user signs up, creates first item, shares via link.
2. **Browse → Search → Empty state** — user searches, sees results or empty state with CTA.
3. **Open item → Edit → Offline save** — user opens item, edits, goes offline, change persists and syncs.

## Platform
iOS + Android via React Native (Expo) + Website preview.

## Out of scope for v1
- Teams/permissions, real-time collaboration, push notifications, analytics.

## Design tokens
See `apps/server/src/design/tokens.ts` — dark-first #0D0D0D, accent #E8493C sparingly, white pill CTA.

## Vertical slices
Each flow is one slice: UI + state + data + edge cases (long text, missing image, slow network, double-tap) before next.
