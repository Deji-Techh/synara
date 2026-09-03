// FILE: dbPanel.test.ts
// Purpose: Database auto-open rule + agent panel tool (fake transport).

import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  ALL_DB_PANEL_TOOLS,
  openDatabasePanelTool,
  requestDatabasePanel,
  setDbPanelTransport,
  shouldRevealDatabasePanel,
  shouldRevealDatabasePanelForText,
} from "./dbPanel.ts";

function toolCtx(): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath: "/tmp/caide-test-app",
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

describe("dyad database panel control", () => {
  it("reveals on DB tools and DB talk, not on file edits", () => {
    for (const name of [
      "execute_sql",
      "get_supabase_project_info",
      "get_neon_project_info",
      "get_database_table_schema",
      "add_integration",
      "enable_nitro",
    ]) {
      expect(shouldRevealDatabasePanel(name)).toBe(true);
    }
    expect(shouldRevealDatabasePanel("write_file")).toBe(false);
    expect(shouldRevealDatabasePanelForText("please create the Supabase database")).toBe(true);
    expect(shouldRevealDatabasePanelForText("add a loading spinner")).toBe(false);
    expect(ALL_DB_PANEL_TOOLS.map((t) => t.name)).toEqual(["open_database_panel"]);
  });

  it("delivers reveals through the transport, or records them unwired", async () => {
    const seen: unknown[] = [];
    setDbPanelTransport({
      revealDatabase: (sessionId, reason) => seen.push({ sessionId, reason }),
    });
    try {
      const out = (await openDatabasePanelTool.execute({ reason: "provision check" }, toolCtx())) as any;
      expect(out.opened).toBe(true);
      expect(out.delivered).toBe(true);
      expect(out.pane).toBe("database");
      expect(seen).toEqual([{ sessionId: "test-session", reason: "provision check" }]);
    } finally {
      setDbPanelTransport(null);
    }
    const pending = await requestDatabasePanel("s", "x");
    expect(pending).toEqual({ requested: true, delivered: false });
  });
});
