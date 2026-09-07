# Caide runtime appendix — React Native (Expo)

How the appllama design skill executes inside Caide. The laws stand
unchanged; only the tooling below is translated. Do not re-derive
replacements — use exactly this mapping.

## Stack mapping (Caide RN scaffold)

| Skill assumes | Caide equivalent |
|---|---|
| expo-router file routes | `app/` — already scaffolded; tabs in `app/(tabs)/_layout.tsx` |
| zustand + React Query + zod | Installed. Stores in `src/store/`, validation inline in forms |
| UI kit | `src/components/` (AppButton, AppTextInput, Card, ListRow, Badge, EmptyState) — extend it, never parallel it |
| `react-native-reanimated` | NOT installed. For gesture/velocity work, add it via `install_package` (`react-native-reanimated` + `react-native-gesture-handler` + `react-native-worklets`), then follow motion.md verbatim |
| FlashList | NOT installed. Use FlatList with `getItemLayout` + `removeClippedSubviews` until lists grow, then add `@shopify/flash-list` via `install_package` |
| `expo-haptics` | NOT installed. Add via `install_package` when the screen needs haptic punctuation |
| SF Symbols / expo-symbols | NOT installed. Use `@expo/vector-icons` (add via `install_package`) with Ionicons/MaterialIcons until symbols are needed |
| `expo-image` | NOT installed. Use React Native `Image` with explicit sizes + `resizeMode`; add `expo-image` for recycling lists or blurhash placeholders |
| MMKV | NOT installed. zustand + AsyncStorage (add `@react-native-async-storage/async-storage`) only when latency shows |

Never claim one of the above is present — check `package.json` first.

## Preview + verification loop (replaces simctl)

You have no iOS Simulator here. The Caide loop is:

1. `open_preview` (or it is already running) — Expo web bundle inside the
   device frame. This is your simulator.
2. Screenshot the preview and actually study it: alignment, spacing rhythm,
   truncation, dark mode, safe areas, home indicator clearance.
3. Exercise every back path the navigator allows, every modal/sheet, the
   keyboard both directions, rapid taps, long content, empty/loading/error
   states.
4. Fix, hot-reload, re-verify. Same bar — "cannot find a flaw" — different
   harness. For frame-by-frame motion truth, graduate to `build_apk` and a
   physical device; never declare 60 fps from the web preview.
5. Reduce Motion, Dynamic Type XL, and landscape (where supported) still
   apply — verify by reasoning over the code when the preview cannot show it,
   and say so explicitly.

## Theme + tokens

`src/design/tokens.ts` + `.caide/design-spec.json` are the single source of
truth. Semantic colors both themes from day one per fidelity law 1; the
scaffold defaults dark-first, matching the skill's expectation that every
screen renders correctly in light AND dark before it is done.
