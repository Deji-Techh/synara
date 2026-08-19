import { z } from "zod";

export const MotionEngineSchema = z.enum([
  "native-css-waapi",
  "motion-react",
  "dotlottie",
  "rive",
  "gsap",
  "three",
]);

export type MotionEngine = z.infer<typeof MotionEngineSchema>;

export const MOTION_ENGINE_PACKAGES: Readonly<
  Record<MotionEngine, readonly string[]>
> = {
  "native-css-waapi": [],
  "motion-react": ["motion"],
  dotlottie: ["@lottiefiles/dotlottie-react"],
  rive: ["@rive-app/react-webgl2"],
  gsap: ["gsap", "@gsap/react"],
  three: ["three", "@react-three/fiber", "@react-three/drei"],
};

export const MotionTimingSchema = z.object({
  durationMs: z.number().int().min(0).max(1200),
  delayMs: z.number().int().min(0).max(1000).default(0),
  easing: z.string().trim().min(2).max(120),
  spring: z
    .object({
      stiffness: z.number().positive().max(2000),
      damping: z.number().positive().max(200),
      mass: z.number().positive().max(10).default(1),
    })
    .optional(),
});

export const ReducedMotionStrategySchema = z.object({
  technique: z.enum(["instant", "fade", "crossfade", "simplified"]),
  durationMs: z.number().int().min(0).max(200),
  preservesMeaning: z.string().trim().min(8).max(300),
});

export const MotionTransitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  trigger: z.string().trim().min(4).max(240),
  source: z.string().trim().min(1).max(160),
  destination: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(8).max(360),
  hierarchy: z.enum([
    "feedback",
    "status",
    "continuity",
    "navigation",
    "delight",
  ]),
  technique: z.enum([
    "none",
    "fade",
    "crossfade",
    "scale",
    "slide",
    "shared-element",
    "layout",
    "spring",
    "stagger",
    "drag",
    "morph",
    "illustration",
  ]),
  engine: MotionEngineSchema,
  elements: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        role: z.string().trim().min(2).max(200),
        from: z.string().trim().min(1).max(200),
        to: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(20),
  timing: MotionTimingSchema,
  interruptible: z.boolean(),
  repeatedInputBehaviour: z.string().trim().min(8).max(300),
  reducedMotion: ReducedMotionStrategySchema,
  performanceBudget: z.object({
    targetFps: z.number().int().min(30).max(120),
    maximumLongTaskMs: z.number().int().min(20).max(100),
    allowLayoutAnimation: z.boolean(),
  }),
});

export const MotionAssetSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  type: z.enum(["none", "svg", "dotlottie", "rive", "video", "three"]),
  purpose: z.string().trim().min(8).max(300),
  sourcePolicy: z.enum(["project-owned", "licensed", "generated", "none"]),
  fallback: z.string().trim().min(4).max(240),
  maximumBytes: z.number().int().min(0).max(20_000_000),
});

export const MotionCoreFlowStepSchema = z
  .object({
    action: z.enum([
      "click",
      "fill",
      "press",
      "expect-visible",
      "expect-text",
      "wait-for-hidden",
    ]),
    selector: z.string().trim().min(1).max(300).optional(),
    value: z.string().max(1000).optional(),
    text: z.string().max(500).optional(),
    key: z.string().max(80).optional(),
    timeoutMs: z.number().int().min(100).max(20_000).default(5000),
  })
  .superRefine((step, context) => {
    if (step.action !== "press" && !step.selector) {
      context.addIssue({
        code: "custom",
        path: ["selector"],
        message: `${step.action} requires a selector`,
      });
    }
    if (step.action === "fill" && step.value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "fill requires a value",
      });
    }
    if (step.action === "press" && !step.key) {
      context.addIssue({
        code: "custom",
        path: ["key"],
        message: "press requires a key",
      });
    }
    if (step.action === "expect-text" && step.text === undefined) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "expect-text requires text",
      });
    }
  });

export const MotionCoreFlowSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  route: z.string().trim().min(1).max(180),
  purpose: z.string().trim().min(8).max(300),
  steps: z.array(MotionCoreFlowStepSchema).min(1).max(30),
});

export const CaideMotionSpecSchema = z.object({
  version: z.literal(1),
  status: z.enum(["draft", "approved"]),
  updatedAt: z.string().datetime(),
  direction: z.object({
    character: z.array(z.string().trim().min(2).max(60)).min(2).max(6),
    intensity: z.enum(["restrained", "balanced", "expressive"]),
    primaryEngine: MotionEngineSchema,
    allowedEngines: z.array(MotionEngineSchema).min(1).max(6),
    motionPrinciple: z.string().trim().min(12).max(400),
    prohibitedPatterns: z
      .array(z.string().trim().min(4).max(180))
      .min(3)
      .max(20),
  }),
  tokens: z.object({
    instantMs: z.number().int().min(0).max(80),
    pressMs: z.number().int().min(80).max(160),
    quickMs: z.number().int().min(120).max(220),
    standardMs: z.number().int().min(180).max(340),
    navigationMs: z.number().int().min(220).max(420),
    expressiveMs: z.number().int().min(320).max(600),
    standardEase: z.string().trim().min(2).max(120),
    emphasizedEase: z.string().trim().min(2).max(120),
    responsiveSpring: z.object({
      stiffness: z.number().positive().max(2000),
      damping: z.number().positive().max(200),
      mass: z.number().positive().max(10),
    }),
  }),
  transitions: z.array(MotionTransitionSchema).min(1).max(100),
  assets: z.array(MotionAssetSchema).max(50),
  audit: z.object({
    routes: z.array(z.string().trim().min(1).max(180)).min(1).max(60),
    triggerSelectors: z.array(z.string().trim().min(1).max(240)).max(60),
    coreFlows: z.array(MotionCoreFlowSchema).min(1).max(20),
    normalMotion: z.boolean(),
    reducedMotion: z.boolean(),
    diagnosticSlowMotion: z.boolean(),
    repeatedInput: z.boolean(),
    cpuThrottling: z.boolean(),
    captureTrace: z.boolean(),
  }),
  quality: z.object({
    minimumMotionScore: z.number().int().min(85).max(100),
    minimumCoreFlowScore: z.number().int().min(90).max(100),
    maximumLayoutShift: z.number().min(0).max(0.25),
    maximumLongTasks: z.number().int().min(0).max(20),
    maximumLeakedAnimations: z.number().int().min(0).max(20),
    maximumDroppedFrameRatio: z.number().min(0).max(0.5),
  }),
});

export type CaideMotionSpec = z.infer<typeof CaideMotionSpecSchema>;

export function requiredMotionPackages(
  spec: Pick<CaideMotionSpec, "direction" | "transitions" | "assets">,
): string[] {
  const engines = new Set<MotionEngine>([
    spec.direction.primaryEngine,
    ...spec.direction.allowedEngines,
    ...spec.transitions.map((transition) => transition.engine),
  ]);
  for (const asset of spec.assets) {
    if (asset.type === "dotlottie") engines.add("dotlottie");
    if (asset.type === "rive") engines.add("rive");
    if (asset.type === "three") engines.add("three");
  }
  return [
    ...new Set(
      [...engines].flatMap((engine) => MOTION_ENGINE_PACKAGES[engine]),
    ),
  ];
}

export function motionSpecCompleteness(spec: CaideMotionSpec): number {
  const checks = [
    spec.status === "approved",
    spec.direction.character.length >= 2,
    spec.direction.prohibitedPatterns.length >= 5,
    spec.transitions.length >= 3,
    spec.transitions.some((item) => item.hierarchy === "feedback"),
    spec.transitions.some((item) => item.hierarchy === "navigation"),
    spec.transitions.every((item) => item.interruptible),
    spec.transitions.every(
      (item) => item.reducedMotion.preservesMeaning.length >= 8,
    ),
    spec.audit.routes.length >= 1,
    spec.audit.coreFlows.length >= 1,
    spec.audit.coreFlows.every((flow) => flow.steps.length >= 1),
    spec.audit.normalMotion,
    spec.audit.reducedMotion,
    spec.audit.repeatedInput,
    spec.audit.captureTrace,
    spec.quality.minimumMotionScore >= 92,
    spec.quality.minimumCoreFlowScore >= 98,
    spec.quality.maximumLayoutShift <= 0.05,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
