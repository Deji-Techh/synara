import { describe, it, expect } from "vitest";
import { generateMotionSpec, auditMotionCode } from "./index.ts";

describe("Milestone M24 — Motion as First-Class Role", () => {
  it("motion spec generated for new project has all required spring, timing, and haptic fields", () => {
    const spec = generateMotionSpec("playful", "ios");
    expect(spec.character).toBe("playful");
    expect(spec.spring.stiffness).toBe(500);
    expect(spec.spring.damping).toBe(25);
    expect(spec.timingCurves.standard).toBeDefined();
    expect(spec.durations.screenTransition).toBe("300ms");
    expect(spec.reducedMotion.enableImmediate).toBe(true);
    expect(spec.haptics.selection).toBe("impact.light");
    expect(spec.haptics.confirmation).toBe("impact.medium");
    expect(spec.haptics.completion).toBe("notification.success");
    expect(spec.haptics.error).toBe("notification.error");
  });

  it("auditMotionCode flags missing reduced-motion alternatives and missing spring configurations", () => {
    const rigidFiles = {
      "src/Card.tsx": `
export function RigidCard() {
  return <div style={{ transition: 'all 0.5s linear' }}>No spring or reduced motion</div>;
}
`,
    };

    const result = auditMotionCode(rigidFiles);
    expect(result.passed).toBe(false);
    expect(result.hasReducedMotionAlternative).toBe(false);
    expect(result.hasPhysicsSprings).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("auditMotionCode passes for motion-complete code with springs, reduced-motion, and haptics", () => {
    const fluidFiles = {
      "src/Button.tsx": `
import React from 'react';
import * as Haptics from 'expo-haptics';
import { motion } from 'framer-motion';

const spring = { stiffness: 400, damping: 30 };

export function FluidButton({ title, onPress }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={spring}
      className="motion-reduce:transition-none"
      onClick={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      {title}
    </motion.button>
  );
}
`,
    };

    const result = auditMotionCode(fluidFiles);
    expect(result.passed).toBe(true);
    expect(result.hasReducedMotionAlternative).toBe(true);
    expect(result.hasHapticIntegration).toBe(true);
    expect(result.hasPhysicsSprings).toBe(true);
    expect(result.issues.length).toBe(0);
  });
});
