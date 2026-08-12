// FILE: CursorAdapter.test.ts
// Purpose: Characterizes Cursor's private Caide host-policy delivery.
// Layer: Provider adapter tests

import { CAIDE_HARNESS_POLICY_MARKER } from "../../agentGateway/harnessPolicy.ts";
import { describe, expect, it } from "vitest";

import { takeCursorCaideHarnessPolicyTextPart } from "./CursorAdapter.ts";

describe("Cursor Caide harness policy", () => {
  it("delivers scoped MCP host context exactly once per fresh/load/fork session", () => {
    for (const lifecycle of ["fresh", "load", "fork"] as const) {
      const state: { harnessPolicyDelivered?: boolean } = {};
      const first = takeCursorCaideHarnessPolicyTextPart(state, true);
      expect(first?.text, lifecycle).toContain(CAIDE_HARNESS_POLICY_MARKER);
      expect(first?.text, lifecycle).toContain("Use the caide_* tools");
      expect(takeCursorCaideHarnessPolicyTextPart(state, true), lifecycle).toBeNull();
    }
  });

  it("stays truthful without a scoped gateway connection", () => {
    expect(takeCursorCaideHarnessPolicyTextPart({}, false)?.text).toContain(
      "Caide MCP control is unavailable",
    );
  });
});
