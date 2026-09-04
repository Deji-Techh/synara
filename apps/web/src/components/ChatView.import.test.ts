// FILE: ChatView.import.test.ts
// Purpose: Smoke-test that ChatView and related composer modules evaluate without reference errors or missing imports.
// Layer: Web component module test

import { describe, expect, it, vi } from "vitest";

vi.mock("./terminal/terminalRuntimeRegistry", () => ({
  terminalRuntimeRegistry: {
    disposeTerminal: vi.fn(),
  },
}));

describe("ChatView and composer modules", () => {
  it("loads ChatView without evaluation or reference errors", async () => {
    vi.stubGlobal("self", globalThis);
    const module = await import("./ChatView");
    expect(module.default).toBeTypeOf("function");
  }, 30_000);

  it("loads DraftHeroHeadline without evaluation or reference errors", async () => {
    const module = await import("./chat/DraftHeroHeadline");
    expect(module.DraftHeroHeadline).toBeTypeOf("function");
  });

  it("loads ComposerBranchBar without evaluation or reference errors", async () => {
    const module = await import("./chat/ComposerBranchBar");
    expect(module.ComposerBranchBar).toBeTypeOf("function");
  });

  it("loads SidebarStageBackdrop without evaluation or reference errors", async () => {
    const module = await import("./SidebarStageBackdrop");
    expect(module.SidebarStageBackdrop).toBeTypeOf("function");
  });
});
