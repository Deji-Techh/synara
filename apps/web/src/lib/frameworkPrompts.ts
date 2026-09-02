// FILE: frameworkPrompts.ts
// Purpose: Premium empty-state prompts per framework — replaces generic hero.
// Premium UX: 3 clickable starters contextual to framework.

import type { ProjectFramework } from "@caide/contracts";

export const FRAMEWORK_PROMPTS: Record<ProjectFramework, readonly string[]> = {
  blank: [
    "Create a todo app with local storage",
    "Build a landing page for my idea",
    "Start a notes app with markdown",
  ],
  "react-native": [
    "Build a habit tracker with Expo",
    "Create a chat app with realtime updates",
    "Make a camera app that saves photos",
  ],
  flutter: [
    "Build a todo app with Flutter",
    "Create a weather app with API",
    "Make a chat app with Firebase",
  ],
  website: [
    "Build a portfolio site with Tailwind",
    "Create a dashboard with charts",
    "Make a blog with MDX",
  ],
} as const;

export function promptsForFramework(
  framework: ProjectFramework | null | undefined,
): readonly string[] {
  return FRAMEWORK_PROMPTS[framework ?? "blank"] ?? FRAMEWORK_PROMPTS.blank;
}
