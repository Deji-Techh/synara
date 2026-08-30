import { describe, it, expect } from "vitest";
import { evaluateTaste, evaluateAntiSlop } from "./index.ts";

describe("Milestone M18 — Taste Model & Anti-AI Slop", () => {
  it("catches AI gradient text, glassmorphism, lorem ipsum, and AI watermarks", () => {
    const slopFile = `
import React from 'react';

export function SloppyCard() {
  return (
    <div className="backdrop-blur-md bg-white/10 p-4 rounded-xl">
      <h1 className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
        Unleash AI Power
      </h1>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      <img src="https://via.placeholder.com/300" alt="placeholder" />
      <span>Powered by AI</span>
    </div>
  );
}
`;

    const result = evaluateAntiSlop({ "src/components/SloppyCard.tsx": slopFile });
    expect(result.violations.length).toBe(5);
    expect(result.violations.some((v) => v.includes("gradient text"))).toBe(true);
    expect(result.violations.some((v) => v.includes("Glassmorphism"))).toBe(true);
    expect(result.violations.some((v) => v.includes("Lorem ipsum"))).toBe(true);
    expect(result.violations.some((v) => v.includes("placeholder image"))).toBe(true);
    expect(result.violations.some((v) => v.includes("watermark"))).toBe(true);
  });

  it("generic or sloppy output receives taste score < 0.7 and is rejected with actionable improvements", () => {
    const sloppyFiles = {
      "src/App.tsx": `
export default function App() {
  return (
    <div className="bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
      Lorem ipsum dolor sit amet
    </div>
  );
}
`,
    };

    const taste = evaluateTaste(sloppyFiles);
    expect(taste.passed).toBe(false);
    expect(taste.score).toBeLessThan(0.7);
    expect(taste.improvements.length).toBeGreaterThan(0);
    expect(taste.antiSlopViolations.length).toBeGreaterThan(0);
  });

  it("premium, physics-grounded, token-compliant output achieves taste score >= 0.85 and passes", () => {
    const premiumFiles = {
      "src/screens/PremiumFeed.tsx": `
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colorTokens, typeScale, spacingUnit } from '../design/tokens';

const springConfig = { stiffness: 400, damping: 30 };

export function PremiumFeed() {
  return (
    <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <Text style={{ color: colorTokens.textPrimary, fontSize: 24, fontWeight: 'bold' }}>
        Activity Overview
      </Text>
      <Text style={{ color: colorTokens.textMuted, fontSize: 15, marginTop: spacingUnit }}>
        Track your latest updates seamlessly.
      </Text>
      <TouchableOpacity
        style={{ minHeight: 44, backgroundColor: colorTokens.accent, borderRadius: 999, justifyContent: 'center' }}
      >
        <Text style={{ color: colorTokens.textPrimary, textAlign: 'center' }}>Explore Metrics</Text>
      </TouchableOpacity>
    </View>
  );
}
`,
    };

    const taste = evaluateTaste(premiumFiles);
    expect(taste.passed).toBe(true);
    expect(taste.score).toBeGreaterThanOrEqual(0.85);
    expect(taste.antiSlopViolations.length).toBe(0);
    expect(taste.motionQualityScore).toBeGreaterThanOrEqual(0.85);
  });
});
