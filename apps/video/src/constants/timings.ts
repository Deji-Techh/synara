import { Easing } from "remotion";

export const FPS = 60;
export const TOTAL_DURATION = 1800; // 30 seconds

export const SCENE_DURATIONS = {
  hook: 240,       // 0:00 - 0:04 (4s)
  home: 360,       // 0:04 - 0:10 (6s)
  settings: 360,   // 0:10 - 0:16 (6s)
  composer: 360,   // 0:16 - 0:22 (6s)
  preview: 300,    // 0:22 - 0:27 (5s)
  finale: 240,     // 0:27 - 0:31 (4s)
} as const;

export const TRANSITION_DURATION = 20;

export const EASING_CRISP = Easing.bezier(0.16, 1, 0.3, 1);
export const EASING_SMOOTH = Easing.bezier(0.45, 0, 0.55, 1);
export const EASING_ANTICIPATE = Easing.bezier(0.36, 0, 0.66, -0.56);

export const SPRING_SNAPPY = {
  damping: 14,
  mass: 0.8,
  stiffness: 140,
};

export const SPRING_GENTLE = {
  damping: 20,
  mass: 1,
  stiffness: 100,
};
