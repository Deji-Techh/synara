import { describe, it, expect } from "vitest";
import { ComparativeBenchmark } from "./benchmark.ts";

describe("Milestone M25 — Comparative Benchmark vs Category Leaders", () => {
  it("benchmark produces a score with specific actionable improvement areas when below bar", () => {
    const rawFiles = {
      "src/App.tsx": `
export default function App() {
  return <div>Simple text without tokens or springs</div>;
}
`,
    };

    const result = ComparativeBenchmark.runBenchmark("productivity", "website", rawFiles);
    expect(result.benchmarkScore).toBeLessThan(0.75);
    expect(result.passed).toBe(false);
    expect(result.referenceArchetype).toBe("Linear / Things 3");
    expect(result.improvements.length).toBeGreaterThan(0);

    // Improvements must be actionable
    expect(
      result.improvements.some((imp) => imp.includes("typographic") || imp.includes("tactile")),
    ).toBe(true);
  });

  it("benchmark achieves high score (>=0.85) when meeting top-tier category standards", () => {
    const topTierFiles = {
      "src/screens/FitnessDashboard.tsx": `
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colorTokens, spacingUnit } from '../design/tokens';

const spring = { stiffness: 400, damping: 30 };

export function FitnessDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <Text className="text-xl font-bold text-white">Daily Summary</Text>
      <Text className="text-xs text-neutral-400">Calories & Activity</Text>
      <View className="rounded-full bg-emerald-500/20 px-3 py-1 self-start">
        <Text className="text-xs text-emerald-400 font-semibold">Active Streak</Text>
      </View>
      <TouchableOpacity
        style={{ minHeight: 44, backgroundColor: colorTokens.accent, borderRadius: 999, shadowOpacity: 0.2 }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
      >
        <Text className="text-center font-bold text-white">Start Workout</Text>
      </TouchableOpacity>
    </View>
  );
}
`,
    };

    const result = ComparativeBenchmark.runBenchmark("fitness", "react-native", topTierFiles);
    expect(result.benchmarkScore).toBeGreaterThanOrEqual(0.85);
    expect(result.passed).toBe(true);
    expect(result.referenceArchetype).toBe("Apple Fitness / Strava");
    expect(result.breakdown.visualPolish).toBeGreaterThanOrEqual(0.9);
  });
});
