// FILE: securityFindings.test.ts
// Purpose: Security-finding tag contract (parser only; retrieval needs a
// live event log).

import { describe, expect, it } from "vitest";
import { getLatestSecurityReview, parseSecurityFindings } from "./securityFindings.ts";

describe("security findings", () => {
  it("parses finding tags with levels", () => {
    const findings = parseSecurityFindings(
      [
        "text",
        '<dyad-security-finding title="SQLi in lookup" level="critical">',
        "Unsanitized id flows into query.",
        "</dyad-security-finding>",
        '<dyad-security-finding title="Weak hash" level="low">md5</dyad-security-finding>',
      ].join("\n"),
    );
    expect(findings).toEqual([
      {
        title: "SQLi in lookup",
        level: "critical",
        description: "Unsanitized id flows into query.",
      },
      { title: "Weak hash", level: "low", description: "md5" },
    ]);
  });

  it("ignores malformed tags", () => {
    expect(
      parseSecurityFindings(
        '<dyad-security-finding title="x" level="bogus">y</dyad-security-finding>',
      ),
    ).toEqual([]);
    expect(parseSecurityFindings("no tags here")).toEqual([]);
  });

  it("returns null when the thread has no review", async () => {
    await expect(getLatestSecurityReview("no-such-thread")).resolves.toBeNull();
  });
});
