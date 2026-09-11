// FILE: designQuality.ts
// Purpose: DESIGN_QUALITY_CONTRACT — the UI/UX/micro-interaction completion
// contract injected into builder prompts (items 1-13). Shared core plus
// per-framework appendices (F1); blank projects get none (gated at the
// injection sites). Concise by design: depth lives in the Appllama skill
// pack + verify_design tool + guides.

import type { CaideFramework } from "./framework.ts";

const DESIGN_QUALITY_CORE = `<design_quality_contract>
Every screen you build or edit must clear this bar before you call the work done (then prove it with \`verify_design\` + screenshots):

**Imagery:** never ship flat-color blocks with initials as product photos. Use \`generate_image\` (then \`copy_file\` into the project's asset directory — web: \`public/\`, Flutter: \`assets/\` + pubspec) or the skill's image-asset patterns. Placeholders only when the user provided no asset — recorded in .caide/media/manifest.json.

**Dark mode:** semantic color tokens in light AND dark from day one (\`design-spec.json\` darkMode.enabled). No light-only screens.

**Icons:** one family per app — SF Symbols on iOS, Material on Android, Material/Cupertino on Flutter. Never mix three families on one screen.

**Type + spacing:** platform type ramp (one display size per screen, tabular numerals for prices/counts/times), 4/8pt rhythm via layout gap (flexbox gap / Padding / Column+Row), continuous corners on iOS, one elevation system for shadows.

**Viewports:** verify every top-level screen at compact phone, large phone, phone landscape, tablet portrait, tablet landscape — intentional width use, no page-level horizontal scroll, no clipped actions, no phone-column floating in tablet space. Record in \`design-spec.json\` viewportsVerified.

**States:** every screen ships loading (skeleton matching card geometry), empty (icon + headline + single CTA), error (retryable), offline, and permission states. Mutations are optimistic with rollback.

**Motion:** platform-default for tabs/scroll/back; near-imperceptible press feedback (≈100ms); standard dialogs/toasts; delight only on rare first-time moments. Push = forward exploration, replace = one-way doors (sign-in wall, onboarding done, purchase) so back can never re-enter the old state; sheets/dialogs never navigate. Honor reduce-motion everywhere; storyboard consequential changes in \`.caide/motion-spec.json\`.

**Touch + a11y:** 44px iOS / 48px Android minimum targets, haptic punctuation on key actions (platform haptics — see framework appendix), accessibility labels on icon buttons, contrast-checked text, Dynamic Type / text-scaling scrub.

**Gate:** run \`verify_design\` before the final summary — fix all majors, re-run until clean.
</design_quality_contract>`;

const RN_QUALITY_APPENDIX = `
<design_quality_rn>
React Native specifics: \`expo-image\` for recycling lists and blurhash, FlashList once lists grow, \`expo-symbols\`/\`sf:\` for iOS iconography, \`useColorScheme\` for themes, \`expo-haptics\` for haptic punctuation.
</design_quality_rn>`;

const FLUTTER_QUALITY_APPENDIX = `
<design_quality_flutter>
Flutter specifics: \`Image\` with \`cacheWidth\` (+ \`cached_network_image\` on proof), Material/Cupertino icons only, \`ThemeMode.dark\` + semantic tokens from day one, \`Semantics\`/\`semanticLabel\` on interactive elements, \`HapticFeedback\` for punctuation, \`MediaQuery.disableAnimations\` honored, assets under \`assets/\` declared in pubspec.
</design_quality_flutter>`;

const WEB_QUALITY_APPENDIX = `
<design_quality_web>
Web specifics: responsive utilities (breakpoints, container queries) instead of fixed phone widths, \`<meta name="viewport">\` required, \`prefers-reduced-motion\` honored, public assets under \`public/\`.
</design_quality_web>`;

/** Full contract for a framework; core-only when unknown, "" for blank. */
export function buildDesignQualityContract(caideFramework?: CaideFramework): string {
  if (caideFramework === "blank") return "";
  if (!caideFramework) return DESIGN_QUALITY_CORE;
  const appendix =
    caideFramework === "flutter"
      ? FLUTTER_QUALITY_APPENDIX
      : caideFramework === "website"
        ? WEB_QUALITY_APPENDIX
        : RN_QUALITY_APPENDIX;
  return `${DESIGN_QUALITY_CORE}\n${appendix}`;
}

/** Legacy export: shared core (tests + callers that scope separately). */
export const DESIGN_QUALITY_CONTRACT = DESIGN_QUALITY_CORE;
