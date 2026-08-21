# AI Rules — Flutter App

This is a **Flutter** project (Dart). Never introduce web frameworks, React,
or web tooling. Build native Flutter UI only.

## Project layout

- `lib/main.dart` — entry point. Keep it minimal.
- `lib/app.dart` — root widget + app-level state (theme mode, session).
- `lib/theme/app_theme.dart` — the ONLY place that defines colors,
  typography, and component themes. Use `Theme.of(context)` everywhere else;
  never hardcode colors or font sizes in widgets.
- `lib/features/<feature>/` — one folder per feature. Screens, widgets, and
  controllers for a feature live together (`home_page.dart`,
  `counter_controller.dart`, ...).
- `test/` — widget tests mirroring `lib/` structure.

## Conventions

- Material 3 (`useMaterial3: true`). Prefer Material components
  (`FilledButton`, `Card`, `NavigationBar`) over custom lookalikes.
- State: start with `setState`, `ValueNotifier`, or `ChangeNotifier` +
  `ListenableBuilder`. Do NOT add state packages (riverpod/bloc/getx)
  unless the user asks.
- No new dependencies without need; when needed, add to `pubspec.yaml`
  and run `flutter pub get`.
- Every screen must handle light AND dark themes via the shared
  `ColorScheme` — test both.
- Respect safe areas / insets; use `SafeArea`, `MediaQuery` padding.
- Accessibility: give icon buttons a `tooltip` or `Semantics` label.

## Before you finish ANY change

1. `flutter analyze` — zero errors/warnings.
2. `flutter test` — all tests pass. Add/update widget tests for new screens.
3. For visual changes, describe what changed so the preview can be verified.
