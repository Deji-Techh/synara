---
name: ui-ux-mastery
triggers: ["ui", "component", "screen", "design", "layout", "a11y"]
companions: ["motion-interaction", "anti-ai-slop"]
---

# UI/UX Mastery Skill Pack

## Design System Adherence

1. **Always read `.caide/design-spec.json` first.** Every color, type size, spacing unit, radius, and
   motion duration comes from the token file. Never improvise raw hex codes or arbitrary sizes.
2. **Semantic tokens over raw values**: reference tokens by name (`colorTokens.background`,
   `typeScale.headline`), not literal `#0D0D0D`. If a value must change, update the token file.
3. **Two-axis targeting**: keep the product contract near the top of your reasoning so the platform
   choice (mobile vs web) survives the whole build, not just the first screen.

## Typography & Layout

4. **Type scale**: one headline scale, one body scale, one caption scale. Headlines ≤ 2 font weights
   used. Body 15-16px, captions 12-13px. Line length ≤ 72 chars.
5. **Spacing rhythm**: all gaps/padding are multiples of the design `spacingUnit` (default 4): 4, 8,
   12, 16, 24, 32, 48, 64. Never arbitrary 7px / 13px gaps.
6. **Visual hierarchy**: one primary focus per view. Header > body > caption contrast. Don't
   style-equalize everything.

## Interaction & Touch

7. **44px minimum tap target** for every interactive element (buttons, inputs, cards, list rows).
   Icons inside get 44×44 hit areas even if visually smaller.
8. **Feedback on every interaction**: press/pressed states, loading spinners, disabled states,
   toast/snackbar confirmations. Nothing should feel dead.
9. **Empty / Loading / Error states on every screen**:
   - Empty: illustration/icon + bold headline + 1-line explanation + single CTA.
   - Loading: skeletons matching the exact geometry of the content that will load.
   - Error: non-blocking card with clear reason + retry action.

## Accessibility

10. High contrast text (AA+), keyboard/voiceover labels, semantic elements (`<button>` not `<div
onClick>`), focus rings, `prefers-reduced-motion` fallbacks for every animation.
11. Safe areas respected on mobile (notches/home indicators); content never under the keyboard.

## Platform Patterns

12. Mobile (RN/Flutter): bottom-tab navigation, no top navbar by default, bottom-sheet for secondary
    actions, native back handling. Web: top/side nav, hover affordances, URL routing.
13. Device-frame discipline: never draw a fake phone bezel or hardcode a 390px shell — the preview
    frame is provided for you; build to fill it.

## Motion

14. Every animation uses a token from `.caide/motion-spec.json`. Defaults: press 110ms, quick 160ms,
    standard 240ms, navigation 300ms, expressive 440ms; standard ease `cubic-bezier(.2,.8,.2,1)`.
15. Reduced-motion: provide a 0ms/semantic fallback for every animation.
