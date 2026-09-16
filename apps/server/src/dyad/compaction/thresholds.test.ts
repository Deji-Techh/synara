// FILE: thresholds.test.ts
// Purpose: Donor-verbatim threshold math, including the large-window 85%
// branch the old tests contradicted (donor code is truth: 400k→340k,
// 1M→850k; the google 190k cap applies only at/below 250k windows).

import { describe, expect, it } from "vitest";
import { getCompactionThreshold, isGoogleProvider, shouldTriggerCompaction } from "./thresholds.ts";

describe("compaction thresholds (donor math)", () => {
  it("reserves headroom under a provider cap on small windows", () => {
    expect(getCompactionThreshold(200_000)).toBe(175_000);
    expect(getCompactionThreshold(200_000, "openai")).toBe(175_000);
    expect(getCompactionThreshold(200_000, "google")).toBe(175_000);
    expect(getCompactionThreshold(128_000, "google")).toBe(103_000);
    expect(getCompactionThreshold(200_000, "gemini-flash")).toBe(175_000);
  });

  it("caps google at 190k at/below 250k windows", () => {
    expect(getCompactionThreshold(250_000, "google")).toBe(190_000);
    expect(getCompactionThreshold(250_000, "openai")).toBe(225_000);
  });

  it("uses the 85% large-window branch above 250k (no provider cap)", () => {
    expect(getCompactionThreshold(400_000, "openai")).toBe(340_000);
    expect(getCompactionThreshold(1_000_000)).toBe(850_000);
    expect(getCompactionThreshold(1_000_000, "google")).toBe(850_000);
  });

  it("guards non-finite windows", () => {
    expect(getCompactionThreshold(0)).toBe(100_000);
    expect(getCompactionThreshold(NaN)).toBe(100_000);
    expect(getCompactionThreshold(-5)).toBe(100_000);
  });

  it("detects google-family providers", () => {
    expect(isGoogleProvider("google")).toBe(true);
    expect(isGoogleProvider("gemini-2.5-pro")).toBe(true);
    expect(isGoogleProvider("openai")).toBe(false);
    expect(isGoogleProvider(undefined)).toBe(false);
  });

  it("triggers at or past the threshold", () => {
    expect(shouldTriggerCompaction(100, 100)).toBe(true);
    expect(shouldTriggerCompaction(99, 100)).toBe(false);
  });
});
