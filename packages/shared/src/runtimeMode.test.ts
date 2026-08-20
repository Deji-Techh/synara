import { describe, expect, it } from "vitest";

import {
  normalizeRuntimeModeForProvider,
  providerSupportsAutoRuntimeMode,
  runtimeModeEscalatesPrivilege,
} from "./runtimeMode";

describe.skip("runtime mode compatibility", () => {
  it("limits Auto to providers with a native reviewer", () => {
    expect(
      providerSupportsAutoRuntimeMode(
        "codex" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe(true);
    expect(
      providerSupportsAutoRuntimeMode(
        "claudeAgent" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe(true);
    expect(
      providerSupportsAutoRuntimeMode(
        "opencode" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe(false);
    expect(
      providerSupportsAutoRuntimeMode(
        "cursor" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe(false);
  });

  it("normalizes only unsupported Auto selections", () => {
    expect(
      normalizeRuntimeModeForProvider(
        "auto",
        "opencode" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe("approval-required");
    expect(
      normalizeRuntimeModeForProvider(
        "approval-required",
        "opencode" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe("approval-required");
    expect(
      normalizeRuntimeModeForProvider(
        "full-access",
        "opencode" as unknown as import("@caide/contracts").ProviderKind,
      ),
    ).toBe("full-access");
  });

  it("treats Auto as more privileged than Supervised but less privileged than Full access", () => {
    expect(runtimeModeEscalatesPrivilege("approval-required", "auto")).toBe(true);
    expect(runtimeModeEscalatesPrivilege("auto", "full-access")).toBe(true);
    expect(runtimeModeEscalatesPrivilege("auto", "approval-required")).toBe(false);
  });
});
