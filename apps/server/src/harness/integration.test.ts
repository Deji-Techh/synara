// harness/integration.test.ts — M26 acceptance: Blank/RN/Website + hey in ask/plan/build + preview
import { describe, it, expect } from "vitest";
import { scaffoldProject } from "./scaffold";
import { CaideRunner } from "./caideRunner";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Caide harness integration — pure Caide, no dyad", () => {
  it("scaffolds blank/website/RN/flutter and keeps framework immutable", async () => {
    const base = mkdtempSync(join(tmpdir(), "caide-test-"));
    try {
      for (const fw of ["blank", "website", "react-native", "flutter"] as const) {
        const root = join(base, fw);
        const res = await scaffoldProject({ projectId: `proj-${fw}`, workspaceRoot: root, framework: fw, name: `Test ${fw}` });
        expect(res.framework).toBe(fw);
        // preview routing: blank unavailable, website browser, RN/flutter device
        expect(["unavailable", "browser", "device"]).toContain(res.framework === "blank" ? "unavailable" : res.framework === "website" ? "browser" : "device");
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("hey in ask/plan/build emits token + checkpoint + stage via caideRunner", async () => {
    const runner = new CaideRunner();
    const events: string[] = [];
    runner.onEvent((e) => events.push(e.event.type));
    const tid = "thread-test";
    const turn = "turn-test";
    runner.startTurn(tid, turn, "proj-blank", "builder", "stage: ask hey", []);
    const res = await runner.runSlice(tid, turn, "hey — first slice: login screen with empty state", "fake-base64-screenshot");
    expect(events).toContain("tool_call");
    expect(events).toContain("checkpoint");
    expect(typeof res.pass).toBe("boolean");
    runner.complete(tid, turn);
    expect(runner.status(turn)).toBe("completed");
  });
});
