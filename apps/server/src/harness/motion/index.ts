/**
 * Motion — dedicated timing curves, swipe-to-dismiss, pull-to-refresh, haptics (M17).
 */
export const motionCurves = {
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  emphasize: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const haptics = { light: "light", medium: "medium", heavy: "heavy" } as const;
