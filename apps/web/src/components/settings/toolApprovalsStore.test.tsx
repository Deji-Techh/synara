// FILE: toolApprovalsStore.test.tsx
// Purpose: Guards approval overrides persistence shape + panel shell.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolApprovalsSection } from "./ToolApprovalsSection";
import { ASK_DEFAULT_TOOLS } from "./toolApprovalsStore";

describe("tool approvals settings", () => {
  it("covers the donor ask-default set", () => {
    const names = ASK_DEFAULT_TOOLS.map((t) => t.name);
    for (const expected of [
      "execute_sql",
      "run_command",
      "write_plan",
      "git_commit",
      "build_apk",
      "web_search",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("renders the approvals section", () => {
    const markup = renderToStaticMarkup(<ToolApprovalsSection />);
    expect(markup).toContain("Agent tool approvals");
    expect(markup).toContain("Safe SQL auto-approve");
    expect(markup).toContain("SQL queries");
    expect(markup).toContain("Everything else");
  });
});
