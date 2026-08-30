import { describe, it, expect } from "vitest";
import { checkCrossAppCoherence } from "./coherence.ts";

describe("Milestone M22 — Cross-App Coherence Pass", () => {
  it("catches mixed icon libraries across different screens in the same app", () => {
    const files = {
      "src/screens/HomeScreen.tsx": `
import React from 'react';
import { Home, User } from 'lucide-react';
export function HomeScreen() { return <div><Home /></div>; }
`,
      "src/screens/SettingsScreen.tsx": `
import React from 'react';
import { CogIcon } from '@heroicons/react/24/solid';
export function SettingsScreen() { return <div><CogIcon /></div>; }
`,
    };

    const result = checkCrossAppCoherence(files);
    expect(result.passed).toBe(false);
    const iconViolation = result.violations.find((v) => v.category === "icon_pack");
    expect(iconViolation).toBeDefined();
    expect(iconViolation?.message).toContain("Mixed icon packs detected");
  });

  it("catches arbitrary off-grid spacing values that violate design rhythm", () => {
    const files = {
      "src/screens/FeedScreen.tsx": `
import React from 'react';
export function FeedScreen() {
  return <div style={{ padding: 23 }}>Arbitrary Feed</div>;
}
`,
    };

    const result = checkCrossAppCoherence(files);
    expect(result.passed).toBe(false);
    const spacingViolation = result.violations.find((v) => v.category === "spacing");
    expect(spacingViolation).toBeDefined();
    expect(spacingViolation?.message).toContain("off-grid arbitrary padding");
  });

  it("passes with score 1.0 when screens adhere to unified tokens and single icon pack", () => {
    const consistentFiles = {
      "src/screens/ScreenA.tsx": `
import React from 'react';
import { Heart } from 'lucide-react';
import { colorTokens, spacingUnit } from '../design/tokens';
export function ScreenA() {
  return <div style={{ backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}><Heart /></div>;
}
`,
      "src/screens/ScreenB.tsx": `
import React from 'react';
import { Bell } from 'lucide-react';
import { colorTokens, spacingUnit } from '../design/tokens';
export function ScreenB() {
  return <div style={{ backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}><Bell /></div>;
}
`,
    };

    const result = checkCrossAppCoherence(consistentFiles);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.violations.length).toBe(0);
  });
});
