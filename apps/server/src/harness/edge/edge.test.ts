import { describe, it, expect } from "vitest";
import { runEdgeSweep, EDGE_CHECKS } from "./index.ts";

describe("Milestone M20 — Edge Case Sweep", () => {
  it("all 7 edge case checks are defined and runnable", () => {
    expect(EDGE_CHECKS.length).toBe(7);
    const ids = EDGE_CHECKS.map((c) => c.id);
    expect(ids).toContain("long_text");
    expect(ids).toContain("missing_data");
    expect(ids).toContain("empty_collection");
    expect(ids).toContain("slow_network");
    expect(ids).toContain("rapid_tap");
    expect(ids).toContain("back_navigation");
    expect(ids).toContain("orientation");
  });

  it("sweep catches missing long-text truncation on poorly guarded code", () => {
    const poorCode = {
      "src/Card.tsx": `
export function SimpleCard({ title }) {
  return <div><h1>{title}</h1></div>;
}
`,
    };

    const sweep = runEdgeSweep("Slice 1", poorCode);
    expect(sweep.passed).toBe(false);
    const longTextCheck = sweep.checks.find((c) => c.id === "long_text");
    expect(longTextCheck?.passed).toBe(false);
    expect(longTextCheck?.reason).toContain("truncation");
  });

  it("sweep passes when code satisfies all 7 edge case requirements", () => {
    const robustCode = {
      "src/UserProfile.tsx": `
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';

export function UserProfile({ user, isLoading, navigation }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const items = user?.items ?? [];

  if (isLoading) return <ActivityIndicator testID="loading-spinner" />;

  return (
    <ScrollView style={{ flex: 1 }} className="w-full">
      <Text numberOfLines={1} className="truncate font-bold">
        {user?.name ?? 'Anonymous User'}
      </Text>
      
      {items.length === 0 ? (
        <Text>No items recorded yet.</Text>
      ) : (
        items.map(item => <Text key={item.id}>{item.title}</Text>)
      )}

      <TouchableOpacity
        disabled={isSubmitting}
        onPress={() => {
          setIsSubmitting(true);
          navigation.goBack();
        }}
      >
        <Text>Save and Return</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
`,
    };

    const sweep = runEdgeSweep("Slice 2", robustCode);
    expect(sweep.passed).toBe(true);
    expect(sweep.checks.every((c) => c.passed)).toBe(true);
  });
});
