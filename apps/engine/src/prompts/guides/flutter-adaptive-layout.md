<flutter-only>
## Adaptive Layout (Flutter)

How to build one Flutter app that composes deliberately on phones, tablets,
desktop, and web — instead of stretching a phone column.

### Breakpoint strategy

- Read size with `MediaQuery.sizeOf(context)` or `LayoutBuilder` (constraints,
  not pixels of the screen) and define named breakpoints once, e.g. compact
  < 600, medium 600–840, expanded > 840 logical pixels.
- Never hard-code a phone-sized canvas. The root `MaterialApp`/`Scaffold`
  fills the available frame; the window/frame is the host's business.
- React to width AND height: phone landscape is short and wide — recompose
  dense sections into columns/panes rather than scrolling a tall portrait
  layout sideways.

### Navigation adaptation

- Compact: bottom `NavigationBar` (3–5 destinations) + `IndexedStack` or
  go_router `StatefulShellRoute.indexedStack` to preserve state per section.
- Medium/expanded: switch to a `NavigationRail` (optionally with a leading FAB
  and extended labels), or a permanent side drawer on desktop widths.
- One navigation model per app (go_router OR plain Navigator). The adaptive
  shell changes chrome, not the routing model.

### Composition patterns

- Two-pane detail layouts at expanded widths: list pane (`ListView.builder`)
  beside a detail pane via `Row` + `Expanded`/`Flexible`; on compact widths the
  same data navigates full-screen. Keep selection state above both panes.
- Fluid grids: `GridView` with `SliverGridDelegateWithMaxCrossAxisExtent` so
  column count derives from available width, not fixed counts.
- Long scrollable shells: `CustomScrollView` + `SliverAppBar` (collapsing on
  compact, static on large), slivers throughout; never nested scrollables with
  opposing axes without physics thought.
- Dialogs become sidesheets/split views at expanded widths when they contain
  forms longer than two fields.

### Insets, safe areas, and text

- Respect `MediaQuery.paddingOf(context)` for notches/system bars and
  `MediaQuery.viewInsetsOf(context)` for keyboard (scroll-to-focus in forms).
- Build with `TextTheme` roles so `MediaQuery.textScalerOf(context)` scaling
  never clips: prefer `Flexible`, `Wrap`, and maxLines+ellipsis over fixed
  heights.
- Verify every top-level screen at 320x568, 390x844, 844x390 landscape,
  768x1024, and 1024x768 — no horizontal overflow, no clipped actions, no
  narrow phone layout floating in empty tablet space.

### Testing

- Widget tests can pump different sizes: `tester.view.physicalSize` /
  `devicePixelRatio` (or `setSize`) to assert the compact vs expanded
  composition actually switches.
</flutter-only>
