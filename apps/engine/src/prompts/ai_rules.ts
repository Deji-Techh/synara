/**
 * Default AI_RULES.md content, shared by build-mode and local-agent prompts so
 * the two can never drift. Overridden per-app by the project's own AI_RULES.md.
 */
export const DEFAULT_AI_RULES = `# AI Rules — Flutter App

This is a **Flutter** project (Dart). Never introduce web frameworks, React,
or web tooling. Build native Flutter UI only.

## Project layout

- \`lib/main.dart\` — entry point. Keep it minimal.
- \`lib/app.dart\` — root widget + app-level state (theme mode, session).
- \`lib/theme/app_theme.dart\` — the ONLY place that defines colors,
  typography, and component themes. Use \`Theme.of(context)\` everywhere else;
  never hardcode colors or font sizes in widgets.
- \`lib/features/<feature>/\` — one folder per feature. Screens, widgets, and
  controllers for a feature live together (\`home_page.dart\`,
  \`counter_controller.dart\`, ...).
- \`test/\` — widget tests mirroring \`lib/\` structure.

## Conventions

- Material 3 (\`useMaterial3: true\`). Prefer Material components
  (\`FilledButton\`, \`Card\`, \`NavigationBar\`) over custom lookalikes.
- State: start with \`setState\`, \`ValueNotifier\`, or \`ChangeNotifier\` +
  \`ListenableBuilder\`. Do NOT add state packages (riverpod/bloc/getx)
  unless the user asks.
- No new dependencies without need; when needed, add to \`pubspec.yaml\`
  and run \`flutter pub get\`.
- Every screen must handle light AND dark themes via the shared
  \`ColorScheme\` — test both.
- Respect safe areas / insets; use \`SafeArea\`, \`MediaQuery\` padding.
- Accessibility: give icon buttons a \`tooltip\` or \`Semantics\` label.

## Before you finish ANY change

1. \`flutter analyze\` — zero errors/warnings.
2. \`flutter test\` — all tests pass. Add/update widget tests for new screens.
3. For visual changes, describe what changed so the preview can be verified.
`;

export const DEFAULT_AI_RULES_REACT_NATIVE = `# AI Rules — React Native (Expo) App

This is a **React Native (Expo)** project. Build native-feel mobile UI with
React Native components. Never introduce Flutter/Dart, Vite, Next.js, or plain
HTML/CSS as a replacement framework.

## Project layout

- \`App.js\` (or \`App.tsx\`) — entry point. Keep it minimal.
- \`src/\` — feature folders: screens, components, navigation, state.
- \`app.json\` — Expo config. Theme/colors live in the app's theme, not inline.

## Conventions

- Use Expo-safe APIs (\`expo-router\` or \`@react-navigation\` for navigation).
- Style with StyleSheet / the project's chosen styling system; no hardcoded
  hex colors scattered in components — centralize them.
- State: start with \`useState\`/\`useReducer\`/React Context. Add a state
  library (zustand/redux) only when the user asks.
- No new dependencies without need; when added, use \`npx expo install\` so the
  version matches the SDK.
- Respect safe areas / insets (\`SafeAreaView\`, \`react-native-safe-area-context\`).
- Accessibility: touch targets ≥ 44px, \`accessibilityLabel\` on icon controls.

## Before you finish ANY change

1. No obvious runtime/JS errors in the affected screens.
2. For visual changes, describe what changed so the preview can be verified.
`;

export const DEFAULT_AI_RULES_WEBSITE = `# AI Rules — Website App

This is a **responsive website** project (Vite/Next). Build a responsive web app
that works on desktop, tablet, and mobile. Never introduce Flutter, React
Native, or mobile-only patterns (bottom tab bars) as primary navigation.

## Conventions

- Use the project's framework idiomatic patterns (React components, routes).
- Style with the project's CSS system / Tailwind tokens; no hardcoded colors.
- Respect breakpoints: desktop uses space well (multi-column, sidebar), mobile
  reflows to a single column with a top nav or hamburger.
- Accessibility: visible focus states, semantic HTML, alt text on images.

## Before you finish ANY change

1. The page renders correctly at mobile, tablet, and desktop widths.
2. For visual changes, describe what changed so the preview can be verified.
`;

export const DEFAULT_AI_RULES_GENERIC = `# AI Rules — App

This is an app or project workspace. Build what the user asked for using the
existing stack in the workspace. Match the conventions already present; do not
assume a framework the codebase does not use.

## Before you finish ANY change

1. The change works with the existing tooling (no obvious errors).
2. For visual changes, describe what changed so the preview can be verified.
`;
