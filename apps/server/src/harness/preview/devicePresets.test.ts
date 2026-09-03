// FILE: devicePresets.test.ts
// Purpose: D gate — preset table integrity + helpers.

import { describe, expect, it } from "vitest";
import {
  DEVICE_PRESETS_ARRAY,
  DEFAULT_DEVICE_PRESET,
  devicePresets,
  getDeviceOrientationDimensions,
  getDevicePreset,
  isDevicePresetId,
} from "./devicePresets.ts";

describe("device presets (d)", () => {
  it("ships a non-empty table with sane dimensions", () => {
    expect(DEVICE_PRESETS_ARRAY.length).toBeGreaterThan(10);
    for (const id of Object.keys(devicePresets)) {
      const preset = getDevicePreset(id)!;
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(preset.platform).toMatch(/android|ios|desktop/);
    }
    expect(isDevicePresetId(DEFAULT_DEVICE_PRESET)).toBe(true);
    expect(isDevicePresetId("nope")).toBe(false);
    expect(getDevicePreset("nope")).toBeUndefined();
  });

  it("swaps dimensions for landscape", () => {
    const preset = getDevicePreset(DEFAULT_DEVICE_PRESET)!;
    const landscape = getDeviceOrientationDimensions(preset, "landscape");
    expect(landscape).toEqual({ width: preset.height, height: preset.width });
    expect(getDeviceOrientationDimensions(preset, "portrait")).toEqual({
      width: preset.width,
      height: preset.height,
    });
  });
});
