import type { AppFrameworkType } from "@/lib/framework_constants";
import type { AppTarget } from "@/lib/schemas";

/**
 * Short, behavioral, checkable product contracts injected near the top of the
 * build system prompt. Each contract is a small set of acceptance criteria the
 * model must satisfy, so the "build target" choice (mobile app vs web app)
 * survives the whole session instead of being diluted by a long prompt.
 *
 * Keep these concise and verifiable — the model should be able to audit its own
 * output against every bullet before finishing.
 */

export const MOBILE_PRODUCT_CONTRACT = `
# PLATFORM CONTRACT — MOBILE APP (non-negotiable)

You are building a **native-feel mobile app** that runs inside the phone/tablet
preview and stays packageable for iOS and Android. Every screen you ship MUST
satisfy the checklist below. Audit your own work against it before you finish.

1. **Bottom tab bar**: the shipping UI MUST include a bottom tab bar with at
   least 2 tabs. It stays visible while navigating between main sections.
2. **Screen-based navigation**: the app navigates between screens (tabs/routes),
   never one infinitely-scrolling webpage. Primary content fits each screen.
3. **Touch-first**: minimum touch target of 44×44 CSS px. No interaction may
   require a hover, a keyboard, or a precise mouse click.
4. **No desktop patterns**: NO top navbar, sidebar, wide multi-column desktop
   dashboard layout, or hover dropdown menus as primary navigation.
5. **Safe area**: account for status bar / home-indicator safe areas.
6. **Tablet-adaptive**: on large/tablet frames the app still looks like a mobile
   app (more columns OK) — never a full desktop site.
7. **Native feel**: scroll behavior, back navigation, focus states and feedback
   should behave like an installed app, not a document.

Before finishing any screen, re-read this checklist and fix every violation.
`;

export const FLUTTER_PRODUCT_CONTRACT = `
# PLATFORM CONTRACT — FLUTTER APP (non-negotiable)

You are building a **native-feel Flutter application** (a Dart widget tree) that
runs in the phone/tablet preview via the Flutter web-server device and stays
packageable for iOS, Android, and the web. Every screen you ship MUST satisfy
the checklist below. Audit your own work against it before you finish.

1. **Dart widget tree**: every feature is real Dart/Flutter code (widgets,
   Material 3 theming, go_router/Navigator navigation) — never HTML/CSS, never
   a static mock seen through the preview.
2. **Bottom NavigationBar**: the shipping UI MUST include a Material
   \`NavigationBar\` with at least 2 destinations. It stays visible while
   navigating between main sections (tab shells / IndexedStack / go_router
   StatefulShellRoute).
3. **Screen-based navigation**: the app navigates between screens (tabs/routes),
   never one infinitely-scrolling page. Primary content fits each screen.
4. **Touch-first with a11y**: minimum touch target 48x48 logical pixels, semantics
   labels + tooltips on icon-only controls, and full keyboard/switch focus.
5. **No desktop patterns**: NO top app-bar-and-sidebar desktop chrome as primary
   navigation; \`NavigationRail\` is fine on tablet/desktop but the phone layout
   must use a bottom bar.
6. **Safe area**: account for status bar / home-indicator / keyboard insets via
   \`MediaQuery.paddingOf(context)\` / \`viewInsetsOf\`.
7. **Adaptive**: on large/tablet frames the app still looks like a mobile app
   (more columns OK) — never a full desktop site. Responsive is in the widget
   code (LayoutBuilder/MediaQuery), not a stretched phone column.
8. **Native feel**: Material-true scroll behaviour, back navigation (PopScope),
   focus states, and feedback behave like an installed app, not a document.
9. **Quality gates**: keep \`flutter analyze\` clean and \`flutter test\` green
   before finishing any screen or build.

Before finishing any screen, re-read this checklist and fix every violation.
`;

export const WEB_PRODUCT_CONTRACT = `
# PLATFORM CONTRACT — WEB APP (non-negotiable)

You are building a **responsive web app** that works on desktop, tablet and
mobile browsers. Every page you ship MUST satisfy the checklist below. Audit
your own work against it before you finish.

1. **Responsive**: layouts reflow correctly at mobile (<640px), tablet
   (640–1024px) and desktop (>1024px) widths. No horizontal scrolling, no
   squished content.
2. **Desktop navigation**: use a top navbar or sidebar for primary navigation.
   Do NOT build a bottom tab bar — that is a mobile-app pattern.
3. **Full input support**: every interaction works with mouse AND keyboard AND
   touch. Focus states are visible; no hover-only controls.
4. **Desktop layouts**: on desktop, use space well (multi-column, sidebars,
   tables, forms) — the page must not be a stretched-out phone layout.
5. **Document correctness**: proper <title>, meta description, viewport, and
   working anchor/route links.
6. **Consistent across breakpoints**: the same information is reachable on all
   sizes; nothing is hidden on mobile behind a hover-only affordance.

Before finishing any page, re-read this checklist and fix every violation.
`;

export const PLATFORM_SPEC_FILE = "docs/platform-spec.md";

export const PLATFORM_SPEC_SYNC_RULE = `
# PLATFORM SPEC (always remember)

Write and keep up to date a file at \`${PLATFORM_SPEC_FILE}\` in the app root.
It records the build target and this platform's design rules so they survive
across sessions. At the start of EVERY session, read it; before finishing,
update it if the platform rules changed. Content: one-line target ("flutter",
"mobile" or "web"), then the platform contract above verbatim.
`;

/**
 * Returns the platform contract + skill-pack guidance for a build target.
 * Defaults to "mobile" to preserve current behavior for existing apps.
 * Pass \`frameworkType\` of "flutter" to get the Flutter product contract.
 */
export function buildPlatformPrompt(
  appTarget?: AppTarget,
  frameworkType?: AppFrameworkType | null,
): string {
  if (frameworkType === "flutter") {
    return `${FLUTTER_PRODUCT_CONTRACT}\n${PLATFORM_SPEC_SYNC_RULE}`;
  }
  const target: AppTarget = appTarget ?? "mobile";
  const contract =
    target === "web" ? WEB_PRODUCT_CONTRACT : MOBILE_PRODUCT_CONTRACT;
  return `${contract}\n${PLATFORM_SPEC_SYNC_RULE}`;
}
