import { describe, it, expect } from "vitest";
import { verifySlice, Verifier } from "./index.ts";

describe("Milestone M9 — Verifier (Screenshot + Token Compare + Fresh Context)", () => {
  it("catches hardcoded raw hex colors instead of token references", () => {
    const badColorFile = `
import React from 'react';
import { View, Text } from 'react-native';

export function BadScreen() {
  // Empty state
  const empty = <Text>No items</Text>;
  // Loading state
  const loading = <Text>Loading...</Text>;
  // Error state
  const error = <Text>Error: failed</Text>;

  return (
    <View style={{ backgroundColor: '#0D0D0D', minHeight: 44 }}>
      <Text style={{ color: '#E8493C' }}>Bad hardcoded color</Text>
    </View>
  );
}
`;

    const result = verifySlice({ "src/screens/BadScreen.tsx": badColorFile });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === "color")).toBe(true);
    expect(result.issues.some((i) => i.includes("#0D0D0D"))).toBe(true);
    expect(result.issues.some((i) => i.includes("#E8493C"))).toBe(true);
  });

  it("catches missing empty, loading, or error states in screen files", () => {
    const missingStatesFile = `
import React from 'react';
import { View, Text } from 'react-native';
import { colorTokens } from '../design/tokens';

export function IncompleteScreen({ data }: any) {
  // Only content state, no empty/loading/error branches!
  return (
    <View style={{ backgroundColor: colorTokens.background }}>
      <Text style={{ color: colorTokens.textPrimary }}>{data.title}</Text>
    </View>
  );
}
`;

    const result = verifySlice({ "src/screens/IncompleteScreen.tsx": missingStatesFile });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === "missing_state")).toBe(true);
    expect(result.issues.some((i) => i.includes("Missing mandatory Empty State"))).toBe(true);
    expect(result.issues.some((i) => i.includes("Missing mandatory Loading State"))).toBe(true);
    expect(result.issues.some((i) => i.includes("Missing mandatory Error State"))).toBe(true);
  });

  it("catches interactive tap targets smaller than 44px minimum", () => {
    const smallTapTargetFile = `
import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { colorTokens } from '../design/tokens';

export function SmallButtonScreen() {
  const empty = <Text>Empty state</Text>;
  const loading = <Text>isLoading...</Text>;
  const error = <Text>onRetry error</Text>;

  return (
    <TouchableOpacity style={{ height: 28, backgroundColor: colorTokens.accent }}>
      <Text>Tap me</Text>
    </TouchableOpacity>
  );
}
`;

    const result = verifySlice({ "src/screens/SmallButtonScreen.tsx": smallTapTargetFile });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.type === "touch_target")).toBe(true);
    expect(result.issues.some((i) => i.includes("28px") && i.includes("44px"))).toBe(true);
  });

  it("passes compliant files with high confidence (> 0.85) and taste score (> 0.80)", () => {
    const fullyCompliantFile = `
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colorTokens, spacingUnit } from '../design/tokens';

export function CompliantScreen({ items, isLoading, isError, onRetry }: any) {
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colorTokens.accent} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
        <Text style={{ color: colorTokens.error }}>Failed to load</Text>
        <TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={onRetry}>
          <Text style={{ color: colorTokens.textPrimary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!items || items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colorTokens.background, justifyContent: 'center' }}>
        <Text style={{ color: colorTokens.textPrimary }}>No items found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colorTokens.background, padding: spacingUnit * 4 }}>
      <Text style={{ color: colorTokens.textPrimary }}>Compliant Feed</Text>
      <TouchableOpacity style={{ minHeight: 44, backgroundColor: colorTokens.accent, borderRadius: 999 }}>
        <Text style={{ color: colorTokens.textPrimary }}>Action</Text>
      </TouchableOpacity>
    </View>
  );
}
`;

    const result = verifySlice(
      { "src/screens/CompliantScreen.tsx": fullyCompliantFile },
      "data:image/png;base64,placeholder_screenshot",
    );

    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
    expect(result.issues.length).toBe(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.tasteScore).toBeGreaterThanOrEqual(0.8);
    expect(result.needsHumanReview).toBe(false);
    expect(result.needsTastePass).toBe(false);
  });
});
