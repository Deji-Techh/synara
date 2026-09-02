export type MotionCharacter = "playful" | "calm" | "energetic" | "minimal";
export type TargetPlatform = "ios" | "android" | "web";

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface HapticMapping {
  selection: "impact.light";
  confirmation: "impact.medium";
  completion: "notification.success";
  error: "notification.error";
}

export interface MotionSpec {
  character: MotionCharacter;
  platform: TargetPlatform;
  spring: SpringConfig;
  timingCurves: {
    standard: string;
    decelerate: string;
    accelerate: string;
  };
  durations: {
    micro: string;
    standard: string;
    screenTransition: string;
  };
  reducedMotion: {
    enableImmediate: boolean;
    cssProperty: "prefers-reduced-motion";
    fallbackDuration: "0ms";
  };
  haptics: HapticMapping;
}

export function generateMotionSpec(
  character: MotionCharacter = "minimal",
  platform: TargetPlatform = "ios",
): MotionSpec {
  const springs: Record<MotionCharacter, SpringConfig> = {
    playful: { stiffness: 500, damping: 25, mass: 1 },
    calm: { stiffness: 300, damping: 35, mass: 1.2 },
    energetic: { stiffness: 600, damping: 28, mass: 0.8 },
    minimal: { stiffness: 400, damping: 30, mass: 1 },
  };

  return {
    character,
    platform,
    spring: springs[character],
    timingCurves: {
      standard: "cubic-bezier(0.16, 1, 0.3, 1)",
      decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1)",
      accelerate: "cubic-bezier(0.4, 0.0, 1, 1)",
    },
    durations: {
      micro: "150ms",
      standard: "220ms",
      screenTransition: "300ms",
    },
    reducedMotion: {
      enableImmediate: true,
      cssProperty: "prefers-reduced-motion",
      fallbackDuration: "0ms",
    },
    haptics: {
      selection: "impact.light",
      confirmation: "impact.medium",
      completion: "notification.success",
      error: "notification.error",
    },
  };
}

export interface MotionAuditResult {
  passed: boolean;
  hasReducedMotionAlternative: boolean;
  hasHapticIntegration: boolean;
  hasPhysicsSprings: boolean;
  issues: string[];
}

export function auditMotionCode(files: Record<string, string>): MotionAuditResult {
  const code = Object.values(files).join("\n");
  const issues: string[] = [];

  const hasReducedMotionAlternative =
    code.includes("motion-reduce") ||
    code.includes("prefers-reduced-motion") ||
    code.includes("AccessibilityInfo") ||
    code.includes("reduceMotion");

  const hasHapticIntegration =
    code.includes("Haptics.") ||
    code.includes("impactAsync") ||
    code.includes("notificationAsync") ||
    code.includes("vibrate") ||
    code.includes("HapticFeedback");

  const hasPhysicsSprings =
    code.includes("stiffness") ||
    code.includes("damping") ||
    code.includes("spring(") ||
    code.includes("withSpring") ||
    code.includes("framer-motion") ||
    code.includes("motion-spec.json");

  if (!hasReducedMotionAlternative) {
    issues.push("No prefers-reduced-motion or accessibility motion reduction fallback provided.");
  }
  if (!hasPhysicsSprings) {
    issues.push(
      "No physics-based spring parameters (stiffness/damping) defined for interactive components.",
    );
  }

  return {
    passed: issues.length === 0,
    hasReducedMotionAlternative,
    hasHapticIntegration,
    hasPhysicsSprings,
    issues,
  };
}
