---
name: onboarding-welcome
description: Apply when the app includes a first-run welcome, onboarding, welcome-back, splash, or login-first screen. Enforces authored entrance choreography, locked-during-entrance interaction states, reduced motion, replay control, and a complete action wall instead of a static placeholder.
context: inline
checkpoint: welcome
---

# Onboarding and Welcome Screen Contract

A welcome screen is the product's first impression. Follow this contract for any
first-run surface: brand moment, value pitch, entrance choreography, an action
wall, and every loading/error/skip/reduced-motion state. Claude may not ship a
static placeholder.

## Anatomy

Every welcome screen has these zones in order:

1. **Brand / hero moment** — the product mark or a signature visual, with a
   distinct entrance (at most one hero element animates at a time).
2. **Value message** — one line of value promise, not a feature list.
3. **Action wall** — primary action (Get Started / Create account / Start free
   trial), secondary action (Log in / I have an account), optional third-party
   buttons (Apple, Google, Email), and the legal line (Privacy / Terms).
4. **Transition** — leaves to the next screen (onboarding, home, login)
   consistently with the app's motion language.

A welcome screen always mounts as a full-height `flex: 1` surface with no
visible navigation header and no surrounding safe-area padding; the component
owns its layout and status bar treatment.

## Entrance choreography

- Normally lasts 1.4–6.6 seconds total; single elements should not take longer.
  Shorter is better for utility products; longer for mood/brand moments.
- Use only one principal entrance technique: scale/blink mascot or mark,
  sequential spring-stagger of elements, circular mask reveal, logo pulse with
  a loader, or dissolve into the final state.
- Motion must explain continuity. Never fake interaction: no infinite spin,
  no looping decorative motion, no animation that delays the action wall
  beyond 6 seconds, no restart on unrelated re-renders.
- Respect `prefers-reduced-motion`: replace spatial motion with a short fade
  or instant state change.

### Recovered motion (numeric)

Reference timing collated from the top welcome screens:

- Logo/mark settle (blink, pulse, rotate): 0.2–1.0s
- Mask/reveal (circular or wipe): 0.2–0.9s
- Staggered spring batch (icons, chips): 1.1–2.6s total, 150–350ms
  between siblings, ease-out
- Loader sequence: 0.6–4.0s, never more than 4s of waiting before use
- Dissolve into final state: 0.6–1.0s
- Slide-in for the final page (from right/up): 0.4–0.8s, strong ease-out
- Color interpolate of background: 300–500ms

## Interactions during entrance

- **Entrance lock**: UI actions are gated until the entrance motion completes;
  if autoplay is off, gate until an initial user tap. Provide a wait state.
- **Replayable**: the entire entrance can replay from a stable state, driven by
  a `replayKey` so parity/replay is cheap, and when replay completes it returns
  to the normal interactive state.
- **Skip / secondary**: someone who already knows the product jumps away in a
  single action, from every state.

## Action wall rules

- Primary action takes the full visual weight (filled, large, 44–48pt+).
- Secondary action is always addressable (Log in), no layering behind a menu.
- Third-party buttons render only the provider's wordmark/icons we are allowed
  to use inside the app canvas; name them literally (Continue with Google).
- Legal line (Privacy Policy, Terms) uses real links — no dead anchors.

## States matrix

Every state must exist: entrance (assumed), autoplay disabled, replaying,
reduced-motion, loading (brand moment while resources load), error (auth or
network), offline, and every action wall button and the close/skip control.
Empty states are allowed only where the product genuinely has no content.

## Accessibility

- Identifiers and labels for every icon + control; social icons to have the
  provider name reads out loud, or a tooltip where not universal.
- 44×44pt touch targets minimum (48 for Android-style rails).
- Show focus state for keyboard; never require hover.
- All text scales to at least Dynamic Type 2XL with no truncation.
- Reduced-motion and replay-complete states differ from the animated entrance
  so state is never ambiguous.

## Action wiring

Every semantic action wires to a specific callable, para out here:

- Primary → `onPrimaryPress` / route to onboarding/account creation
- Secondary → `onSecondaryPress` / log in path
- Close/skip → `onClosePress` / accept-and-continue
- Legal → the matching public URL, no placeholder

Never invent dead callbacks: if the app has no route for an action, the button
still requires at least one proven destination or an explicit error state.

## Platform behavior

- Re-check the 4 required viewports (320×568, 390×844, 844×390, 768×1024,
  1024×768). The layout must adapt, not stretch a single column.
- Keyboard raising the surface must not cover the action wall.
- The action wall must be fully reachable without scroll when the keyboard or
  reduced height is in play.

## Completion gate

Before calling the welcome screen done, self-audit:

- One master entrance, ≤6.0s, reduced-motion fallback implemented.
- All states above exist in code.
- Every control wired or proven, no placeholders.
- Viewport and keyboard behavior verified, no death scroll.
- Existing nav outside the screen untouched, no branding assets stolen.
