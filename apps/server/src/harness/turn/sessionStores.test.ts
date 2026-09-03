// FILE: sessionStores.test.ts
// Purpose: M3g gate — settings sync application, JSONL snapshot/restore
// round-trip, store clearing (isolated baseDir, no home writes).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getDatabaseLink } from "../../dyad/db/connections.ts";
import { applyTodoUpdate, getTodos } from "../../dyad/plan/todoStore.ts";
import { SessionStorage } from "../session/storage.ts";
import {
  applySettingsSync,
  clearSessionStores,
  getOrCreateSessionStores,
  restoreSessionState,
  snapshotSessionState,
} from "./sessionStores.ts";

function tempStorage(): { storage: SessionStorage; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-sess-"));
  return { storage: new SessionStorage({ baseDir: dir, debounceMs: 1 }), dir };
}

describe("session stores persistence (m3g)", () => {
  it("applies settings sync payloads with validation", () => {
    const sid = `s-${Date.now()}-a`;
    const entry = applySettingsSync(sid, {
      toolConsents: { run_command: "never", bad: "sometimes" as never },
      safeSql: false,
      mcpAutoApproveSafe: false,
      mcpConsents: [{ serverId: 1, toolName: "issue_write", consent: "always" }],
      dbLinks: [{ provider: "supabase", databaseUrl: "postgres://x/db" }],
    });
    try {
      expect(entry.consent.get("run_command")).toBe("never");
      expect(entry.consent.get("bad")).toBeUndefined();
      expect(entry.safeSql).toBe(false);
      expect(entry.mcpAutoApproveSafe).toBe(false);
      expect(entry.mcp.get(1, "issue_write")).toBe("always");
      expect(getDatabaseLink(sid)?.provider).toBe("supabase");
    } finally {
      clearSessionStores(sid);
    }
  });

  it("round-trips todos, links, and consents through JSONL", async () => {
    const { storage } = tempStorage();
    const sid = `s-${Date.now()}-b`;
    applyTodoUpdate(sid, false, [{ id: "1", content: "Build auth", status: "pending" }]);
    applySettingsSync(sid, {
      toolConsents: { git_commit: "always" },
      safeSql: false,
      dbLinks: [{ provider: "neon", databaseUrl: "postgres://n/db" }],
    });
    await snapshotSessionState(sid, storage);
    await storage.flush(sid);
    // Simulate restart: wipe in-memory state, then restore.
    clearSessionStores(sid);
    const { clearTodos } = await import("../../dyad/plan/todoStore.ts");
    clearTodos(sid);
    await restoreSessionState(sid, storage);
    try {
      expect(getTodos(sid)).toHaveLength(1);
      expect(getDatabaseLink(sid)?.provider).toBe("neon");
      expect(getOrCreateSessionStores(sid).consent.get("git_commit")).toBe("always");
      expect(getOrCreateSessionStores(sid).safeSql).toBe(false);
    } finally {
      clearSessionStores(sid);
    }
  });

  it("restores nothing gracefully when no snapshot exists", async () => {
    const { storage } = tempStorage();
    const sid = `s-${Date.now()}-c`;
    await expect(restoreSessionState(sid, storage)).resolves.toBeUndefined();
    clearSessionStores(sid);
  });
});
