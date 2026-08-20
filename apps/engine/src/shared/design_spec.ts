import { z } from "zod";

export const DesignPlatformSchema = z.enum(["ios", "android", "adaptive"]);
export const DesignDensitySchema = z.enum(["spacious", "balanced", "dense"]);
export const DesignEmphasisSchema = z.enum([
  "content",
  "conversation",
  "data",
  "imagery",
  "workflow",
]);

export const DesignReferenceSchema = z.object({
  app: z.string().trim().min(1).max(100),
  purpose: z.enum(["information-architecture", "interaction", "visual-character"]),
  patternToStudy: z.string().trim().min(8).max(300),
  prohibitedCopying: z.array(z.string().trim().min(2).max(120)).min(1).max(8),
});

export const TypographyTokenSchema = z.object({
  family: z.string().trim().min(1).max(120),
  size: z.number().positive().max(96),
  lineHeight: z.number().positive().max(3),
  weight: z.number().int().min(300).max(900),
  letterSpacing: z.number().min(-0.1).max(0.3).default(0),
});

export const MotionTokenSchema = z.object({
  durationMs: z.number().int().min(0).max(600),
  easing: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(3).max(160),
});

export const DesignStateSchema = z.object({
  required: z.boolean(),
  behaviour: z.string().trim().min(4).max(400),
});

export const ScreenSpecificationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(100),
  route: z.string().trim().min(1).max(160),
  userGoal: z.string().trim().min(8).max(400),
  primaryAction: z.string().trim().min(2).max(160),
  secondaryActions: z.array(z.string().trim().min(2).max(160)).max(8),
  contentHierarchy: z.array(z.string().trim().min(2).max(200)).min(1).max(16),
  layout: z.string().trim().min(8).max(500),
  compactBehaviour: z.string().trim().min(8).max(400),
  expandedBehaviour: z.string().trim().min(8).max(400),
  states: z.object({
    loading: DesignStateSchema,
    empty: DesignStateSchema,
    error: DesignStateSchema,
    offline: DesignStateSchema,
    permissionDenied: DesignStateSchema,
  }),
});

export const ComponentSpecificationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(8).max(300),
  variants: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  states: z
    .array(
      z.enum([
        "default",
        "hover",
        "pressed",
        "focus-visible",
        "selected",
        "disabled",
        "loading",
        "success",
        "error",
      ]),
    )
    .min(3),
  accessibility: z.array(z.string().trim().min(4).max(200)).min(1).max(12),
});

export const CaideDesignSpecSchema = z.object({
  version: z.literal(1),
  status: z.enum(["draft", "approved"]),
  updatedAt: z.string().datetime(),
  product: z.object({
    name: z.string().trim().min(1).max(100),
    archetype: z.enum([
      "social",
      "finance",
      "education",
      "fitness",
      "commerce",
      "productivity",
      "media",
      "utility",
      "travel",
      "healthcare",
      "developer-tool",
      "creative-tool",
      "other",
    ]),
    primaryUser: z.string().trim().min(3).max(240),
    primaryGoal: z.string().trim().min(8).max(400),
    coreActions: z.array(z.string().trim().min(2).max(160)).min(1).max(12),
    risks: z.array(z.string().trim().min(3).max(240)).max(12),
  }),
  direction: z.object({
    personality: z.array(z.string().trim().min(2).max(60)).min(2).max(6),
    density: DesignDensitySchema,
    visualEmphasis: DesignEmphasisSchema,
    memorableIdea: z.string().trim().min(8).max(300),
    references: z.array(DesignReferenceSchema).min(1).max(3),
  }),
  platform: z.object({
    target: DesignPlatformSchema,
    navigationPattern: z.string().trim().min(4).max(240),
    safeAreaPolicy: z.string().trim().min(4).max(240),
    keyboardPolicy: z.string().trim().min(4).max(240),
    systemBarPolicy: z.string().trim().min(4).max(240),
    minimumTouchTarget: z.number().int().min(40).max(64),
  }),
  tokens: z.object({
    colours: z.record(z.string(), z.string().min(1)),
    typography: z.record(z.string(), TypographyTokenSchema),
    spacing: z.array(z.number().int().positive().max(128)).min(4).max(16),
    radii: z.array(z.number().int().min(0).max(64)).min(2).max(8),
    elevations: z.record(z.string(), z.string().min(1)),
    motion: z.record(z.string(), MotionTokenSchema),
  }),
  screens: z.array(ScreenSpecificationSchema).min(1).max(60),
  components: z.array(ComponentSpecificationSchema).min(1).max(100),
  quality: z.object({
    minimumOverallScore: z.number().int().min(90).max(100),
    minimumAccessibilityScore: z.number().int().min(90).max(100),
    minimumMotionScore: z.number().int().min(85).max(100),
    minimumCoreFlowScore: z.number().int().min(90).max(100),
    maximumCriticalIssues: z.number().int().min(0).max(5),
    maximumMajorIssues: z.number().int().min(0).max(10),
    maximumMinorIssues: z.number().int().min(0).max(20),
    autoRepairPasses: z.number().int().min(0).max(5),
    requiredReviewPasses: z.number().int().min(1).max(5),
  }),
});

export type CaideDesignSpec = z.infer<typeof CaideDesignSpecSchema>;

export const DEFAULT_DESIGN_ENGINE_CONFIG = {
  version: 2,
  enabled: true,
  requireDesignSpecBeforeCode: true,
  requireMotionSpecBeforeCode: true,
  referenceMode: "pattern-guided",
  maximumReferenceApps: 3,
  referencePolicy: "abstract-patterns-only",
  defaultPlatform: "adaptive",
  componentPolicy: {
    preferCaideComponents: true,
    allowRawHtmlControls: false,
    requireJustificationForOneOffComponents: true,
    allowArbitraryColours: false,
    allowArbitrarySpacing: false,
    allowInlineStyles: false,
    allowInlineCustomProperties: true,
    allowNestedCards: false,
  },
  qualityGates: {
    minimumOverallScore: 94,
    minimumAccessibilityScore: 95,
    minimumMotionScore: 92,
    minimumCoreFlowScore: 98,
    maximumCriticalIssues: 0,
    maximumMajorIssues: 0,
    maximumMinorIssues: 5,
    autoRepairPasses: 3,
    requiredReviewPasses: 3,
    rejectBuildBelowThreshold: true,
  },
} as const;

export function parseDesignSpec(value: unknown): CaideDesignSpec {
  return CaideDesignSpecSchema.parse(value);
}

export function safeParseDesignSpec(value: unknown) {
  return CaideDesignSpecSchema.safeParse(value);
}

export function designSpecCompleteness(spec: CaideDesignSpec): number {
  const checks = [
    spec.product.coreActions.length >= 2,
    spec.product.risks.length >= 1,
    spec.direction.personality.length >= 2,
    spec.direction.references.length >= 2,
    spec.tokens.spacing.length >= 6,
    Object.keys(spec.tokens.colours).length >= 6,
    Object.keys(spec.tokens.typography).length >= 3,
    Object.keys(spec.tokens.motion).length >= 6,
    spec.screens.length >= 2,
    spec.components.length >= 3,
    spec.screens.every((screen) => screen.contentHierarchy.length >= 2),
    spec.components.every((component) => component.states.includes("focus-visible")),
    spec.quality.minimumOverallScore >= 94,
    spec.quality.minimumAccessibilityScore >= 95,
    spec.quality.minimumMotionScore >= 92,
    spec.quality.minimumCoreFlowScore >= 98,
    spec.quality.maximumMajorIssues === 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
