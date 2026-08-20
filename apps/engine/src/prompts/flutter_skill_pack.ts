/**
 * Flutter UI skill pack — the mandatory UI/UX completion contract injected into
 * the agent prompt whenever the app framework type is "flutter". Replaces the
 * mobile/web UI skill packs on the Flutter path so the model builds real Dart
 * widget trees with Material 3, adaptive layouts, state management, and motion
 * instead of CSS/JS web contracts.
 *
 * Authored inline (no SKILL.md?raw imports) so the pack stays self-contained.
 */

import { FLUTTER_DESIGN_ENGINE_CONTRACT } from "./design_engine_contract";

export const FLUTTER_SKILL_FRONTMATTERS: Record<string, { description?: string }> = {
  "motion-interaction": {
    description:
      "Animations and motion with Flutter implicit/explicit animation widgets and Material timing semantics.",
  },
  "product-flow": {
    description:
      "End-to-end Flutter flows: navigation, state, empty/loading/error paths, deep links, and back semantics.",
  },
  "backend-production": {
    description:
      "Production backend/API/storage wiring for Flutter apps via http/dio and lean services.",
  },
  "anti-ai-slop": {
    description:
      "Distinctive, non-generic Flutter UI: real theming, real navigation, no template filler, no jank.",
  },
  "onboarding-welcome": {
    description:
      "Onboarding and welcome screens with Flutter NavigationBar, animations, and Material a11y.",
  },
};

const FLUTTER_PREVIEW_CONTRACT = `
<caide-preview-contract>
- CAIDE renders the running Flutter app (web-server device) inside the selected
  phone, foldable, tablet, or responsive frame. Render only the application
  screen — never a fake device, bezel, browser toolbar, status-bar shell, or
  "Made with" badge inside the app.
- Never hard-code a fixed phone-sized canvas such as 390x780. The root
  \`MaterialApp\` and every top-level \`Scaffold\` must fill the available frame;
  responsive layout is implemented with \`LayoutBuilder\`, \`MediaQuery\`,
  \`Expanded\`/\`Flexible\`, \`NavigationBar\` vs \`NavigationRail\`, and grid/list
  slivers — never a single centered phone column stretched to tablet width.
- Build deliberate adaptive compositions: phone portrait one column; phone
  landscape recompose dense sections into columns or panes; tablet/desktop widen
  content, navigation (rail), grids, dialogs, and primary workflows instead of
  leaving large unused gutters.
- Verify every top-level screen and important state at 320x568 compact phone,
  390x844 large phone, 844x390 phone landscape, 768x1024 tablet portrait, and
  1024x768 tablet landscape. At each size confirm intentional use of width and
  height, no horizontal overflow (watch long strings; use \`Flexible\`/\`Text\`
  overflow semantics), no clipped actions, no overlapping controls, no
  inaccessible content, and no narrow phone layout floating in empty tablet space.
- Do not finish a build or edit until adaptive behaviour is implemented in Dart
  for all five viewport classes. If a device/debug service is available, render
  each viewport; otherwise inspect every screen's layout code explicitly.
</caide-preview-contract>
`;

const MODULES = `
## Module 1 — Material 3 & Flutter fundamentals
- Use \`MaterialApp(title: ..., theme/themeMode/darkTheme, home: ...)\` with
  \`ColorScheme.fromSeed(seedColor: <brand>)\` for light and dark modes; do not
  scatter raw \`Colors.x\` or hex literals through widgets.
- Keep widget trees small and focused: < ~100 lines per \`build()\`, extract
  private widgets and widget classes, always \`const\` constructors where
  possible, and keys (\`ValueKey\`/\`ObjectKey\`) only when element identity or
  reordering matters.
- Prefer \`StatelessWidget\` over \`StatefulWidget\` unless local mutable state
  or lifecycle is genuinely needed; prefer \`const\` by default.

## Module 2 — Architecture & state management
- Size the approach to the app. Plain \`setState\` + \`ValueNotifier\`/
  \`ChangeNotifier\` and \`InheritedWidget\` for small apps; \`provider\` for
  medium; \`riverpod\` for larger; \`bloc\` for complex domains. Keep it boring —
  do not add a state library before the code needs it.
- Separate UI, logic, and services: widgets render state, controllers/handlers
  mutate it, service/repository classes own I/O. No business logic in \`build()\`;
  no HTTP inside widgets (use a service + FutureBuilder or explicit state).
- Dispose controllers/notifiers (\`dispose()\`), close streams, cancel timers.

## Module 3 — Navigation & routing
- One navigation model per app. Use \`go_router\` for deep links, nested
  navigation, and web URL support; plain \`Navigator.push\`/\`MaterialPageRoute\`
  is fine for simple apps. Never mix both casually.
- Bottom NavigationBar + \`IndexedStack\`/nested shells (or go_router
  \`StatefulShellRoute.indexedStack\`) for main sections. Every screen is
  reachable and back-able; guard destructive flows with \`PopScope\`.
- On web/desktop targets supply deep-link handling and URL sync via go_router.

## Module 4 — Theming & design tokens
- Define \`ThemeExtension\` subclasses (e.g. AppSpacing, AppRadii, AppDurations)
  or const token classes for spacing rhythm, radii, durations, and semantic
  colours; reference tokens, never magic constants.
- Contrast >= 4.5:1 for body text (check seeded palettes; use
  \`ColorScheme.onSurface\` variants). Support \`MediaQuery.platformBrightness\`,
  themeMode switching, and \`MediaQuery.textScaler\` — build with
  \`textScaler\`-friendly \`TextTheme\` so large text never clips.

## Module 5 — Responsive & adaptive layout
- \`LayoutBuilder\`/\`MediaQuery.sizeOf\` breakpoints: choose \`NavigationBar\` vs
  \`NavigationRail\`, one column vs two-pane vs grid. \`Expanded\`/\`Flexible\`
  instead of fixed pixel sizes inside rows/columns; \`CustomScrollView\` +
  \`SliverAppBar\`/slivers for scrollable shells; \`GridView\` with
  \`SliverGridDelegateWithMaxCrossAxisExtent\` for fluid grids.
- Target phone + tablet + desktop + web; never a stretched phone layout.
- Respect safe areas \`MediaQuery.paddingOf(context)\` and keyboard
  \`MediaQuery.viewInsetsOf(context)\`.

## Module 6 — Lists & performance
- Lazy lists always: \`ListView.builder\`/\`.separated\` or \`SliverList\`; never
  \`ListView(children: [...]) \` for collections. Avoid \`shrinkWrap\` inside a
  scroll view; set \`itemExtent\`/\`prototypeItem\` when items share height.
- Paginate/infinite-scroll large feeds (scroll controller + load-more). Use
  \`RepaintBoundary\` around heavy children, \`shouldRepaint\` false where safe,
  and move expensive computation off the UI isolate with \`compute()\`/isolates.

## Module 7 — Animation & motion
- Implicit first: \`AnimatedContainer\`, \`AnimatedSwitcher\`,
  \`TweenAnimationBuilder\`, \`AnimatedOpacity\`, etc. Reaching for an explicit
  \`AnimationController\` every time is overengineering.
- Timings per Material: micro 150-250ms, expressive 300-500ms; one easing
  family. Respect \`MediaQuery.disableAnimationsOf(context)\` for reduced motion;
  repeat/loop animations must be purposeful and stop when the screen is gone
  (dispose controllers).
- Use \`Hero\` for shared-element transitions and \`AnimatedSwitcher\` for state
  swaps; never animate layout-critical dimensions in a tight loop.

## Module 8 — Accessibility
- Semantics: \`Semantics\`/\`MergeSemantics\`, \`semanticLabel\` on icon-only
  controls, \`Tooltip\` on every icon button, hit targets >= 48x48dp. Group
  toggle state with \`Semantics(toggled: ...)\`/listTile \`semanticLabel\`.
- Focus traversal with \`FocusTraversalGroup\`, \`AutofillGroup\`, visible focus
  on desktop/web; announce dynamic state changes via \`SemanticsService\` or
  \`FlutterSemanticsAnnouncer\` patterns.
- Everything reachable by keyboard/switch (Focus + traversal), and honor
  \`MediaQuery.accessibleNavigationOf(context)\`. A11y is a checkpoint gate.

## Module 9 — Data, networking, errors
- \`http\`/\`dio\` through a service/repository; parse JSON with
  \`json_serializable\` or explicit \`fromJson\`. Prefer explicit loading/error/
  empty/success states over bare \`FutureBuilder\` when UI depends on error
  details; every screen handles loading, empty, error, and (where relevant)
  offline with a retry affordance.
- Offline/persistence via \`hive\`/\`drift\`/\`sqflite\` only when the product
  needs it; do not cache pre-emptively. Validate at boundaries (user input, API).

## Module 10 — Platform channels & device features
- Use official plugins (\`shared_preferences\`, \`permission_handler\`,
  \`image_picker\`, \`geolocator\`, \`camera\`, \`file_picker\`); write custom
  \`MethodChannel\`/pigeon code only when no plugin fits, and wrap it behind an
  interface so the UI stays testable.
- Request permissions at the right moment with user-facing rationale; handle
  denied-state UIs. Respect safe-area and keyboard insets. Prefer platform-idiomatic
  widgets (\`Cupertino*\`) only where identity matters; Material 3 is the default.

## Module 11 — Testing
- \`flutter_test\`: widget tests for behaviour + semantics, golden tests only for
  stable visuals, unit tests for logic/services, \`integration_test\` for real
  device flows. Cover state transitions and a11y semantics, not just happy paths.
- Keep \`flutter analyze\` clean and run \`flutter test\` before finishing a
  feature; put tests next to the code (\`test/\` mirroring \`lib/\`).

## Module 12 — Pub ecosystem & dependencies
- Prefer stable, well-maintained packages with high pub.dev scores; pin sensible
  ranges in pubspec.yaml, commit pubspec.lock for apps. Avoid abandoned or
  redundant packages; keep \`flutter_lints\`/analysis_options rules on.

## Module 13 — Anti-AI-slop Flutter rules
- No generic placeholder apps: real theming, real navigation, real data.
- No over-engineering, no magic constants, consistent naming, Material idioms,
  every screen reachable + back-able, no jank, no emoji-as-icons.
`;

const QUALITY_GATE = `
## Premium polish bar (this is a premium application, not a demo)
The result must feel like a shipped, premium app — never a scaffold, template,
or tech demo:
- Interaction polish: press feedback, focus/selection states, and disabled
  states everywhere a user can tap, tab, or toggle; light, considered haptics
  (\`HapticFeedback\`) on primary actions where the platform supports them.
- A consistent motion language: the same durations/easings used for the same
  kinds of transitions across the whole app; nothing pops, snaps, or lingers.
- Dark and light mode both designed and checked — seeded from the same
  \`ColorScheme\`, no unreadable surfaces in either mode.
- Microcopy matters: empty states explain why and what to do next; loading
  states are honest; error messages tell the user what happened and how to fix
  it. No "Error: null" strings.
- Everything reachable, nothing janky: lazy lists (\`ListView.builder\`,
  slivers), \`const\` constructors, \`RepaintBoundary\` where rebuilds get heavy,
  no frames dropped while scrolling, no layout shift on load.
- The app icon, launch screen, and app identity are configured per platform
  (AndroidManifest, iOS launch storyboard/icon references) when the project has
  those targets; no leftover default \`flutter create\` branding where a real
  product name/icon is expected.

## Completion gate
Before finishing any screen or build: \`flutter analyze\` must be clean, primary
core flows must run, all five viewport classes and light/dark must be exercised,
reduced motion and large text must not break layout, and the file narrows to
"no issues". Re-read the design-engine contract and fix every violation.
`;

/**
 * Flutter UI skill pack — replaces the mobile/web packs on the Flutter path.
 */
export const CAIDE_FLUTTER_UI_SKILL_PACK = `
<mandatory-ui-ux-skill>
The following CAIDE skill is permanently enabled for every Flutter application build and edit. Follow it as a completion contract, not optional inspiration.

${FLUTTER_PREVIEW_CONTRACT}

${FLUTTER_DESIGN_ENGINE_CONTRACT}

${MODULES}

${QUALITY_GATE}
</mandatory-ui-ux-skill>
`.trim();
