# Caide runtime appendix — Flutter (Material 3)

How the appllama design skill executes in Flutter inside Caide. The laws
stand; the OS-specific nouns translate iOS → Material as below. Where the
skill says "iOS", read "the platform's convention" — Material on Android,
Cupertino where the scaffold uses it.

## Stack mapping (Caide Flutter scaffold)

| Skill assumes             | Caide equivalent                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| expo-router tabs + stacks | `go_router` `StatefulShellRoute.indexedStack` in `lib/router.dart` — already scaffolded                                                                                                                               |
| zustand + React Query     | `flutter_riverpod` providers in `lib/providers/` + Dio client in `lib/services/api_client.dart`                                                                                                                       |
| UI kit                    | `lib/widgets/` (AppButton, AppTextField, AppCard, SettingsRow, EmptyState, LoadingView) — extend it, never parallel it                                                                                                |
| Reanimated springs        | Implicit animations (`AnimatedContainer`, `AnimatedOpacity`) for narrative motion; `AnimationController` + `SpringSimulation` for gesture velocity. Same frequency gate, same 150–300 ms timing, same ease-out curves |
| Gesture handler           | `GestureDetector` with velocity from `onEnd` details; interruptible by rebuilding from the current value                                                                                                              |
| Haptics                   | `HapticFeedback` from `flutter/services.dart` — built in, no package needed                                                                                                                                           |
| Lists                     | `ListView.builder` / `GridView.builder` with stable keys; add `scrollable_positioned_list` only for jump-to-index needs                                                                                               |
| Images                    | `Image` with `cacheWidth`/`cacheHeight` + `gaplessPlayback` in lists; `cached_network_image` via `install` only when remote-image caching proves necessary                                                            |
| Forms                     | `AppTextField` + local validation state (see `LoginForm`); `TextInputAction.next` chains, validate on submit/blur                                                                                                     |
| Offline                   | `OfflineBanner` is mounted in `main.dart` — keep it mounted                                                                                                                                                           |

## Navigation translation

- push vs replace → `context.push` vs `context.go` / `replace`. One-way
  doors (sign-in wall, onboarding done, purchase) land with `go`, so back
  can never re-enter the old state.
- Sheets → `showModalBottomSheet` with detents via `DraggableScrollableSheet`;
  dialogs → `showDialog`; destructive confirms → `showModalBottomSheet` with
  a destructive action row or `AlertDialog`.
- Tabs are peers: `StatefulShellRoute` keeps each branch's stack; re-tapping
  pops to root (scaffold default).

## Preview + verification loop (replaces simctl)

1. `open_preview` — Flutter web-server bundle inside the device frame.
2. Screenshot and study it: alignment, spacing rhythm, truncation, dark +
   light (toggle `themeModeProvider`), safe areas, home-indicator clearance.
3. Exercise back paths, sheets/modals, keyboard both directions, rapid taps,
   long content, empty/loading/error states.
4. `flutter analyze` stays clean; `flutter test` covers the widget kit.
   Graduate to `build_apk` + a physical device for frame truth. Same bar —
   "cannot find a flaw".
5. Text scaling (Flutter's Dynamic Type equivalent) and landscape where
   supported still apply — verify by reasoning when the preview cannot show
   it, and say so explicitly.

## Theme + tokens

`lib/theme/tokens.dart` + `app_theme.dart` (Material3, seed from accent)

- `.caide/design-spec.json` are the single source of truth. Never hard-code
  colors; never mix grey families; one corner scale per the anti-slop lock.
