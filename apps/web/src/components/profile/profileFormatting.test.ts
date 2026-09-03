// FILE: profileFormatting.test.ts
// Purpose: Guards quota label formatting for the profile insights.

import { describe, expect, it } from "vitest";
import { formatQuotaLabel } from "./profileFormatting";

describe("formatQuotaLabel", () => {
  it("renders full quota state", () => {
    expect(
      formatQuotaLabel({
        status: "available",
        planName: "Pro",
        usedPercent: 42.4,
        resetsAt: "2026-06-03T00:00:00.000Z",
      }),
    ).toBe("Pro · 42% used · resets Jun 3");
  });

  it("degrades gracefully with partial data", () => {
    expect(
      formatQuotaLabel({ status: "available", planName: null, usedPercent: null, resetsAt: null }),
    ).toBe("Available");
    expect(
      formatQuotaLabel({ status: "unavailable", planName: null, usedPercent: null, resetsAt: "bad" }),
    ).toBe("Unavailable");
  });
});
