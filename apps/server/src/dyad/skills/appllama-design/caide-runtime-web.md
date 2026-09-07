# Caide runtime appendix — Website (responsive web, NOT a phone app)

This is the anti-app translation layer. The appllama laws were written for
native mobile; applied literally to a website they produce the exact
failure the Caide preview contract forbids — a narrow phone column floating
in a tablet viewport. Read this appendix as OVERRIDES: where it conflicts
with the mobile skill text, this file wins for website targets.

## What does NOT transfer (do not do these on web)

- **No bottom tab bar.** Tabs are a mobile pattern. Web navigation is a top
  navbar (or sidebar for dashboards) per the scaffold `Layout` — never a
  fixed bottom tab strip on a desktop viewport.
- **No sheets-as-navigation, no haptics, no SF Symbols.** Sheets become
  dialogs/drawers (`Dialog` kit component); haptics don't exist — use motion
  + state change as the only feedback; icons are lucide-react, one family.
- **No Dynamic Island / safe-area / home-indicator logic.** The analogues
  are: sticky headers with backdrop blur, content clearing fixed footers,
  and `100dvh` viewport units on mobile browsers.
- **No device matrix.** The matrix is five viewport classes, verified in
  code and the resizable preview: 320px compact phone, 768px tablet,
  1024px laptop, 1440px desktop, phone-landscape short height. Tablet and
  desktop must widen content, grids, dialogs, and workflows — never center
  a phone column in empty space.
- **No 60-fps-on-device bar.** The web bar is Core Web Vitals on the
  production build: INP < 200 ms, CLS < 0.1, LCP < 2.5 s — plus zero layout
  shift on load, theme switch, and route change.

## What transfers directly

- **Anti-slop laws, verbatim**: one accent, one grey family, shape lock,
  no emoji iconography, one label per intent, full state cycles, the
  mechanical slop pre-flight (counts, not judgment).
- **Typography hierarchy**: platform ramp → web ramp (display/title/body/
  caption, one display size per page, tabular numerals for counts/prices).
- **State architecture**: TanStack Query for server state, zustand slices
  for client state, local component state for ephemeral UI, optimistic
  updates with loud rollback.
- **Image pipeline**: style system first, @1x/@2x densities, theme twins
  where surfaces differ, < 200 KB per screen-level asset.
- **Research method**: study winning *websites* in the category with the
  same playbooks (replace "screens" with "pages/flows", "paywall position"
  with "pricing-page structure"). The cross-app grammar extraction and the
  saturation stop-rule apply unchanged.

## Motion translation (no Reanimated on web)

- Frequency gate unchanged: platform defaults for tabs/scroll/back,
  near-imperceptible < 150 ms for press/row select, standard motion for
  dialogs/toasts, delight only on rare first-time moments.
- Implementation: CSS transitions + `prefers-reduced-motion` media query
  (spatial motion collapses to fades), View Transitions API for route-level
  continuity where supported. Never animate width/height/padding per frame;
  transform/opacity only. `motion` package (framer-motion successor) only if
  springs are genuinely needed — install via `install_package` first.
- Press feedback on press-in, 100–150 ms; exits faster than entrances;
  enter from fade + slight rise, never scale(0).

## Stack mapping (Caide website scaffold)

| Skill assumes | Caide equivalent |
|---|---|
| expo-router routes | `react-router` `HashRouter` in `src/App.tsx`; pages in `src/pages/` |
| zustand + React Query + zod | Installed. Slices in `src/store/`, forms validated with zod |
| UI kit | `src/components/ui/` (Button, Input, Card, Dialog, Badge, Tabs, Switch, Avatar, Skeleton, EmptyState) — extend it, never parallel it |
| Auth session | `useAuthStore` demo session; wire Supabase/Neon Auth into store + LoginForm |
| Verification | vitest unit + Playwright `e2e/` smoke (boots its own preview server). Add specs for new user flows |

## Verification loop (replaces simctl)

1. `open_preview` (browser preview) at all five viewport classes.
2. Screenshot and study: hierarchy, rhythm, truncation, light + dark
   (ThemeToggle), 200% text zoom, keyboard navigation, focus order.
3. Exercise every route, dialog open/close, form validation paths, empty/
   loading/error states, back/forward across routes.
4. `bun run build` clean + Playwright green. Same bar — "cannot find a flaw".
