// FILE: blueprintTools.test.ts
// Purpose: A1 gate — blueprint tool flow, framework resolution, validation,
// enforcement gate semantics.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  assertAppBlueprintApproved,
  approveBlueprint,
  BlueprintNotApprovedError,
  clearBlueprint,
  getBlueprint,
  isBlueprintApproved,
  setBlueprintRequired,
} from "./blueprintStore.ts";
import {
  executeWriteAppBlueprint,
  getBlueprintTransport,
  setBlueprintTransport,
  writeAppBlueprintTool,
} from "./blueprintTools.ts";

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    toolId: "tool-test",
  };
}

const INPUT = {
  app_name: "FreshBite",
  user_prompt: "Build me a restaurant website",
  design_direction: "Warm and inviting",
  primary_color: "#E85D04",
  visuals: [{ type: "logo" as const, description: "Header logo", prompt: "Minimalist logo, warm tones" }],
};

describe("dyad blueprint transplant (a1)", () => {
  it("registers the tool with donor consent preview", () => {
    expect(writeAppBlueprintTool.name).toBe("write_app_blueprint");
    expect(writeAppBlueprintTool.presentCall?.({ app_name: "X" })).toBe("App Blueprint: X");
  });

  it("writes, stores, and emits the blueprint (explicit framework)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-bp-"));
    const sent: unknown[] = [];
    setBlueprintTransport({ sendBlueprintUpdate: (s, b) => sent.push({ s, b }) });
    try {
      const out = (await writeAppBlueprintTool.execute({ ...INPUT, framework: "website" }, toolCtx(dir))) as string;
      expect(out).toMatch(/Waiting for the user/);
      const stored = sent[0] as any;
      expect(stored.b.appName).toBe("FreshBite");
      expect(stored.b.framework).toBe("website");
      expect(stored.b.visuals).toHaveLength(1);
    } finally {
      setBlueprintTransport(null);
      expect(getBlueprintTransport()).toBeNull();
    }
  });

  it("resolves framework from disk when omitted, validates color", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-bp-"));
    fs.writeFileSync(path.join(dir, "pubspec.yaml"), "name: x\n");
    const sent: unknown[] = [];
    setBlueprintTransport({ sendBlueprintUpdate: (s, b) => sent.push(b) });
    try {
      await executeWriteAppBlueprint(INPUT, "s-disk", dir);
      expect((sent[0] as any).framework).toBe("flutter");
    } finally {
      setBlueprintTransport(null);
      clearBlueprint("s-disk");
    }
    await expect(
      executeWriteAppBlueprint({ ...INPUT, primary_color: "red" }, "s-bad", dir),
    ).rejects.toThrow();
  });

  it("enforces the gate: blocks writers, passes readers/planners/blueprint", () => {
    const sid = `s-${Date.now()}-g`;
    try {
      // Gate off: everything passes.
      expect(() => assertAppBlueprintApproved(sid, "write_file", true)).not.toThrow();
      setBlueprintRequired(sid);
      // Blocked: state-modifying tools.
      expect(() => assertAppBlueprintApproved(sid, "write_file", true)).toThrow(
        BlueprintNotApprovedError,
      );
      // Pass: blueprint tool itself, planning tools, capability-gated, readers.
      expect(() => assertAppBlueprintApproved(sid, "write_app_blueprint", true)).not.toThrow();
      expect(() =>
        assertAppBlueprintApproved(sid, "planning_questionnaire", true, { planningSpecific: true }),
      ).not.toThrow();
      expect(() =>
        assertAppBlueprintApproved(sid, "execute_sandbox_script", true, { capabilityGated: true }),
      ).not.toThrow();
      expect(() => assertAppBlueprintApproved(sid, "read_file", false)).not.toThrow();
      // Approval opens the gate.
      approveBlueprint(sid);
      expect(isBlueprintApproved(sid)).toBe(true);
      expect(() => assertAppBlueprintApproved(sid, "write_file", true)).not.toThrow();
    } finally {
      clearBlueprint(sid);
    }
  });
});
