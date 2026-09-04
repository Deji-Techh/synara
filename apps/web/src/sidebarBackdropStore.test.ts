import { describe, it, expect, beforeEach } from "vitest";
import { useSidebarBackdropStore } from "./sidebarBackdropStore";

describe("sidebarBackdropStore", () => {
  beforeEach(() => {
    useSidebarBackdropStore.getState().resetToDefault();
  });

  it("defaults to null customImage", () => {
    expect(useSidebarBackdropStore.getState().customImage).toBeNull();
  });

  it("updates and resets customImage", () => {
    const testData = "data:image/webp;base64,sample123";
    useSidebarBackdropStore.getState().setCustomImage(testData);
    expect(useSidebarBackdropStore.getState().customImage).toBe(testData);

    useSidebarBackdropStore.getState().resetToDefault();
    expect(useSidebarBackdropStore.getState().customImage).toBeNull();
  });
});
