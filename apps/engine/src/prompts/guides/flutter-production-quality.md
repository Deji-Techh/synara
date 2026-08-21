<flutter-only>
## Production Quality (Flutter)

Run this checklist before calling any Flutter feature or build complete. It is a
completion contract, not a suggestion.

### Static analysis and tests

- `flutter analyze` reports **zero** issues. Do not silence diagnostics with
  `// ignore:` comments unless you can explain why the lint does not apply.
- `flutter test` passes, including widget tests for every screen you touched.
  Test behaviour and semantics (`Semantics` labels, toggled state), not just
  happy paths.
- New logic lives in testable units (services/controllers), not inside
  `build()` methods.

### Error, loading, empty, and offline states

- Every async surface implements all four states: loading, empty, error,
  success — plus offline with a retry affordance where relevant.
- Error messages tell the user what happened and what to do next. Never render
  raw exceptions, `"Error: null"`, or stack traces in the UI.
- Use explicit state objects (sealed classes / freezed unions) over bare
  `FutureBuilder` snapshots when the UI depends on error details.

### Performance pass

- All scrollable collections use lazy builders (`ListView.builder`,
  `.separated`, slivers). No `ListView(children: [...])` for data collections;
  no `shrinkWrap: true` inside a scroll view.
- Heavy list children are wrapped in `RepaintBoundary`; expensive computation
  runs off the UI isolate via `compute()`/isolates.
- No dropped frames while scrolling the primary flows; no layout shift on load;
  images have explicit dimensions or fit so they do not reflow content.
- Controllers, streams, timers, and `AnimationController`s are disposed.

### Accessibility pass

- Icon-only controls carry `semanticLabel` (or `Tooltip`); hit targets are
  >= 48x48dp; contrast >= 4.5:1 for body text in light AND dark themes.
- Layout survives `MediaQuery.textScalerOf(context)` at large scales without
  clipping; reduced motion (`disableAnimationsOf`) degrades meaningfully.
- Primary flows are reachable by keyboard/switch access on desktop/web targets.

### Release readiness

- Light and dark themes both designed, seeded from one `ColorScheme.fromSeed`.
- App display name, icon, and launch screen configured per platform; no
  leftover default `flutter create` branding where a real product name is
  expected.
- `pubspec.yaml` versions pinned to sane ranges; `flutter_lints` enabled;
  no abandoned packages added for a single convenience call.
</flutter-only>
