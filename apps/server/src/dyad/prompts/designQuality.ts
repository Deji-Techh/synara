// FILE: designQuality.ts
// Purpose: DESIGN_QUALITY_CONTRACT — the UI/UX/micro-interaction completion
// contract injected into builder prompts (items 1-13). Concise by design:
// depth lives in the Appllama skill pack + verify_design tool + guides.

export const DESIGN_QUALITY_CONTRACT = `<design_quality_contract>
Every screen you build or edit must clear this bar before you call the work done (then prove it with \`verify_design\` + screenshots):

**Imagery:** never ship flat-color blocks with initials as product photos. Use \`generate_image\` (then \`copy_file\` into public/) or the skill's image-asset patterns. Placeholders only when the user provided no asset — recorded in .caide/media/manifest.json.

**Dark mode:** semantic color tokens in light AND dark from day one (\`design-spec.json\` darkMode.enabled). No light-only screens.

**Icons:** one family per app — SF Symbols on iOS (\`expo-symbols\`/\`sf:\`), Material on Android. Never mix three families on one screen.

**Type + spacing:** platform type ramp (one display size per screen, tabular numerals for prices/counts/times), 4/8pt rhythm via flexbox gap, continuous corners on iOS, one elevation system for shadows.

**Viewports:** verify every top-level screen at compact phone, large phone, phone landscape, tablet portrait, tablet landscape — intentional width use, no page-level horizontal scroll, no clipped actions, no phone-column floating in tablet space. Record in \`design-spec.json\` viewportsVerified.

**States:** every screen ships loading (skeleton matching card geometry), empty (icon + headline + single CTA), error (retryable), offline, and permission states. Mutations are optimistic with rollback.

**Motion:** platform-default for tabs/scroll/back; near-imperceptible press feedback (≤110ms); standard dialogs/toasts; delight only on rare first-time moments. Push = forward exploration, replace = one-way doors (sign-in wall, onboarding done, purchase) so back can never re-enter the old state; sheets/dialogs never navigate. Honor reduce-motion everywhere; storyboard consequential changes in \`.caide/motion-spec.json\`.

**Touch + a11y:** 44px minimum targets, haptic punctuation on key actions (\`expo-haptics\`), accessibility labels on icon buttons, contrast-checked text, Dynamic Type scrub.

**Gate:** run \`verify_design\` before the final summary — fix all majors, re-run until clean.
</design_quality_contract>`;
