import { Schema } from "effect";

/** Design-spec + motion-spec document shapes (`.caide/design-spec.json`,
 * `.caide/motion-spec.json`). Schema-only contract backing the
 * `verify_design` agent tool and the plan-mode authoring mandate. */

export const DesignColorTokens = Schema.Struct({
  accent: Schema.String,
  background: Schema.String,
  surface: Schema.String,
  textPrimary: Schema.String,
  textMuted: Schema.String,
});
export type DesignColorTokens = typeof DesignColorTokens.Type;

export const DesignTypeScale = Schema.Record(Schema.String, Schema.String);
export type DesignTypeScale = typeof DesignTypeScale.Type;

export const DesignScreenSpec = Schema.Struct({
  goal: Schema.String,
  entry: Schema.optional(Schema.String),
  primaryAction: Schema.optional(Schema.String),
  states: Schema.optional(Schema.Array(Schema.String)),
});
export type DesignScreenSpec = typeof DesignScreenSpec.Type;

export const DesignSpecDocument = Schema.Struct({
  colorTokens: DesignColorTokens,
  typeScale: Schema.optional(DesignTypeScale),
  spacingUnit: Schema.optional(Schema.Number),
  screens: Schema.optional(Schema.Record(Schema.String, DesignScreenSpec)),
  darkMode: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      tokens: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    }),
  ),
  imagery: Schema.optional(
    Schema.Struct({
      strategy: Schema.Literals(["generated", "user-provided", "illustrated-placeholder", "mixed"]),
      provenance: Schema.optional(Schema.String),
    }),
  ),
  viewportsVerified: Schema.optional(Schema.Array(Schema.String)),
  accessibility: Schema.optional(
    Schema.Struct({
      minTapTarget: Schema.optional(Schema.Number),
      contrastChecked: Schema.optional(Schema.Boolean),
      dynamicType: Schema.optional(Schema.Boolean),
    }),
  ),
});
export type DesignSpecDocument = typeof DesignSpecDocument.Type;

export const MotionSpecEntry = Schema.Struct({
  id: Schema.String,
  trigger: Schema.String,
  technique: Schema.String,
  engine: Schema.optional(Schema.String),
  timingMs: Schema.optional(Schema.Number),
  interruption: Schema.optional(Schema.String),
  reducedMotionFallback: Schema.optional(Schema.String),
});
export type MotionSpecEntry = typeof MotionSpecEntry.Type;

export const MotionSpecDocument = Schema.Struct({
  entries: Schema.Array(MotionSpecEntry),
  reducedMotionHonored: Schema.optional(Schema.Boolean),
});
export type MotionSpecDocument = typeof MotionSpecDocument.Type;

export const FIVE_VIEWPORT_CLASSES = [
  "compact-phone",
  "large-phone",
  "phone-landscape",
  "tablet-portrait",
  "tablet-landscape",
] as const;
