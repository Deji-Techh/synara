import { describe, expect, it, vi } from "vitest";

import {
  getCompactionThreshold,
  getTemperature,
  shouldTriggerCompaction,
} from "@/ipc/utils/token_utils";
import { findLanguageModel } from "@/ipc/utils/findLanguageModel";

vi.mock("@/main/settings", () => ({
  readSettings: vi.fn(),
}));

vi.mock("@/ipc/utils/findLanguageModel", () => ({
  findLanguageModel: vi.fn(),
}));

const mockFindLanguageModel = vi.mocked(findLanguageModel);

describe("getTemperature", () => {
  it("does not set a default temperature for custom models", async () => {
    mockFindLanguageModel.mockResolvedValueOnce({
      id: 1,
      apiName: "custom-model",
      displayName: "Custom Model",
      type: "custom",
    });

    await expect(
      getTemperature({ provider: "custom::provider", name: "custom-model" }),
    ).resolves.toBeUndefined();
  });

  it("keeps the fallback temperature for non-custom models without metadata", async () => {
    mockFindLanguageModel.mockResolvedValueOnce({
      apiName: "cloud-model",
      displayName: "Cloud Model",
      type: "cloud",
    });

    await expect(getTemperature({ provider: "provider", name: "cloud-model" })).resolves.toBe(0);
  });
});

describe("getCompactionThreshold", () => {
  describe("large context windows (> 250k)", () => {
    it("allows up to 85% of the window for very large contexts", () => {
      expect(getCompactionThreshold(400_000, "openai")).toBe(340_000);
      expect(getCompactionThreshold(1_000_000, "anthropic")).toBe(850_000);
      expect(getCompactionThreshold(1_000_000, "google")).toBe(850_000);
    });

    it("treats unknown providers the same as any non-google provider", () => {
      expect(getCompactionThreshold(400_000, "vertex")).toBe(340_000);
      expect(getCompactionThreshold(400_000, "openrouter")).toBe(340_000);
    });
  });

  describe("standard context windows", () => {
    it("falls back to contextWindow - 25k when the cap is higher", () => {
      expect(getCompactionThreshold(200_000, "openai")).toBe(175_000);
      expect(getCompactionThreshold(128_000, "anthropic")).toBe(103_000);
    });

    it("caps google output at 190k for standard windows", () => {
      expect(getCompactionThreshold(200_000, "google")).toBe(175_000);
      expect(getCompactionThreshold(128_000, "google")).toBe(103_000);
    });
  });
});

describe("shouldTriggerCompaction", () => {
  it("triggers when token count meets the large-context threshold", () => {
    expect(shouldTriggerCompaction(340_000, 400_000, "openai")).toBe(true);
    expect(shouldTriggerCompaction(339_999, 400_000, "openai")).toBe(false);
  });

  it("triggers earlier for google than for other providers", () => {
    expect(shouldTriggerCompaction(190_000, 240_000, "google")).toBe(true);
    expect(shouldTriggerCompaction(190_000, 240_000, "openai")).toBe(false);
  });

  it("respects the contextWindow - 25k floor when the cap is higher", () => {
    expect(shouldTriggerCompaction(175_000, 200_000, "openai")).toBe(true);
    expect(shouldTriggerCompaction(174_999, 200_000, "openai")).toBe(false);
    expect(shouldTriggerCompaction(175_000, 200_000, "google")).toBe(true);
  });
});
