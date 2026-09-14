// FILE: integrationFollowUp.test.ts
// Purpose: Deferred integration follow-up arming/dispatch (donor parity).

import { describe, expect, it } from "vitest";
import {
  armIntegrationFollowUp,
  dropIntegrationFollowUp,
  takeDueIntegrationFollowUp,
} from "./integrationFollowUp.ts";

describe("integration follow-up dispatch", () => {
  it("arms, dispatches once, then clears", () => {
    armIntegrationFollowUp("s-1", "r-1", "Continue with the DB work.");
    expect(takeDueIntegrationFollowUp("s-1")).toBe("Continue with the DB work.");
    // Single-shot: second take finds nothing.
    expect(takeDueIntegrationFollowUp("s-1")).toBeNull();
  });

  it("drops armed follow-ups on dismiss/cancel paths", () => {
    armIntegrationFollowUp("s-2", "r-2", "Continue.");
    dropIntegrationFollowUp("s-2");
    expect(takeDueIntegrationFollowUp("s-2")).toBeNull();
  });

  it("latest arm wins per session", () => {
    armIntegrationFollowUp("s-3", "r-a", "First.");
    armIntegrationFollowUp("s-3", "r-b", "Second.");
    expect(takeDueIntegrationFollowUp("s-3")).toBe("Second.");
  });
});
