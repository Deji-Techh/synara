# `.caide/design-spec.json` template

A substantial new application or redesign must create or update this file before
feature UI code. Keep the JSON valid against `src/shared/design_spec.ts`.

Required sections:

- `product`: primary user, outcome, core actions, risks, and archetype.
- `direction`: personality, density, visual emphasis, one memorable useful idea,
  and one to three abstract reference patterns.
- `platform`: target profile, navigation, safe areas, keyboard, system bars, and
  minimum touch target.
- `tokens`: semantic colours, typography, spacing, radii, elevation, and motion.
- `screens`: route, user goal, primary action, content hierarchy, responsive
  behaviour, and complete states.
- `components`: purpose, finite variants, interactive states, and accessibility.
- `quality`: acceptance thresholds and repair-pass limit.

The specification is a product contract, not decorative documentation. Update it
when product direction or the design system changes. Preserve it for narrow bug
fixes.
