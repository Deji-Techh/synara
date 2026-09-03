import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import {
  defineTool,
  ToolScheduler,
  executeTool,
  createDefaultRegistry,
  ALL_CORE_TOOLS,
} from "./index.ts";

describe("Milestone M4 — Tool DSL, Scheduler, Executor & Core Tools", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-tools-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("defineTool registers correctly, and executor validates schema rejecting malformed input", async () => {
    const customTool = defineTool({
      name: "calculate_sum",
      description: "Calculates the sum of numbers",
      schema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      readOnly: true,
      modifiesState: false,
      execute: async ({ a, b }) => a + b,
    });

    const ctx = {
      signal: new AbortController().signal,
      appPath: tempDir,
      sessionId: "s1",
      toolId: "t1",
    };

    // Valid call
    const validRes = await executeTool(customTool, { a: 10, b: 25 }, ctx);
    expect(validRes.success).toBe(true);
    if (validRes.success) {
      expect(validRes.output).toBe(35);
    }

    // Invalid call (missing 'b', 'a' is string)
    const invalidRes = await executeTool(customTool, { a: "not a number" }, ctx);
    expect(invalidRes.success).toBe(false);
    if (!invalidRes.success) {
      expect(invalidRes.error.type).toBe("ValidationError");
      expect(invalidRes.error.tool).toBe("calculate_sum");
      expect(invalidRes.error.message).toContain("Schema validation failed");
      expect(invalidRes.error.suggestedFix).toBeDefined();
    }
  });

  it("runs two readOnly tools in parallel, and runs write tools sequentially", async () => {
    let toolAStartTime = 0;
    let toolBStartTime = 0;
    let writeStartTime = 0;

    const readToolA = defineTool({
      name: "read_a",
      description: "read tool A",
      schema: z.object({}),
      readOnly: true,
      modifiesState: false,
      execute: async () => {
        toolAStartTime = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        return "resultA";
      },
    });

    const readToolB = defineTool({
      name: "read_b",
      description: "read tool B",
      schema: z.object({}),
      readOnly: true,
      modifiesState: false,
      execute: async () => {
        toolBStartTime = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        return "resultB";
      },
    });

    const writeTool = defineTool({
      name: "write_c",
      description: "write tool C",
      schema: z.object({}),
      readOnly: false,
      modifiesState: true,
      execute: async () => {
        writeStartTime = Date.now();
        await new Promise((r) => setTimeout(r, 20));
        return "resultWrite";
      },
    });

    const registry = new Map([
      ["read_a", readToolA],
      ["read_b", readToolB],
      ["write_c", writeTool],
    ]);

    const scheduler = new ToolScheduler();
    const calls = [
      { id: "c1", name: "read_a", args: {} },
      { id: "c2", name: "read_b", args: {} },
      { id: "c3", name: "write_c", args: {} },
    ];

    const baseCtx = {
      signal: new AbortController().signal,
      appPath: tempDir,
      sessionId: "s-parallel",
    };

    const results = await scheduler.runCalls(calls, registry, baseCtx, async (def, call, ctx) => {
      const res = await executeTool(def, call.args, ctx);
      if (!res.success) throw new Error(res.error.message);
      return res.output;
    });

    expect(results.get("c1")?.status).toBe("completed");
    expect(results.get("c2")?.status).toBe("completed");
    expect(results.get("c3")?.status).toBe("completed");

    // Tool A and Tool B should have started virtually simultaneously (within 15ms)
    expect(Math.abs(toolAStartTime - toolBStartTime)).toBeLessThan(20);
    // Write tool must have started AFTER read tools completed
    expect(writeStartTime).toBeGreaterThanOrEqual(toolAStartTime + 35);
  });

  it("aborts sibling concurrent tools when one tool in a batch fails (Sibling Abort)", async () => {
    let toolBSiblingAborted = false;

    const failingTool = defineTool({
      name: "failing_read",
      description: "fails fast",
      schema: z.object({}),
      readOnly: true,
      modifiesState: false,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error("Critical read failure in storage");
      },
    });

    const slowTool = defineTool({
      name: "slow_read",
      description: "slow read that gets aborted",
      schema: z.object({}),
      readOnly: true,
      modifiesState: false,
      execute: async (_, ctx) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 200);
          ctx.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            toolBSiblingAborted = true;
            reject(new Error("Sibling aborted"));
          });
        });
        return "slowResult";
      },
    });

    const registry = new Map([
      ["failing_read", failingTool],
      ["slow_read", slowTool],
    ]);

    const scheduler = new ToolScheduler({ siblingAbortOnFailure: true });
    const calls = [
      { id: "c1", name: "failing_read", args: {} },
      { id: "c2", name: "slow_read", args: {} },
    ];

    const baseCtx = {
      signal: new AbortController().signal,
      appPath: tempDir,
      sessionId: "s-sibling",
    };

    const results = await scheduler.runCalls(calls, registry, baseCtx, async (def, call, ctx) => {
      const res = await executeTool(def, call.args, ctx);
      if (!res.success) throw new Error(res.error.message);
      return res.output;
    });

    expect(results.get("c1")?.status).toBe("failed");
    expect(results.get("c2")?.status).toBe("failed");
    expect(toolBSiblingAborted).toBe(true);
  });

  it("enforces stage and role permissions returning structured error when called out of sequence", async () => {
    const gatedTool = defineTool({
      name: "deploy_production",
      description: "Deploys project",
      schema: z.object({ env: z.string() }),
      readOnly: false,
      modifiesState: true,
      allowedStages: ["verification_passed", "release"],
      allowedRoles: ["fixer"],
      execute: async () => "deployed",
    });

    // Invalid stage
    const invalidStageRes = await executeTool(
      gatedTool,
      { env: "prod" },
      {
        signal: new AbortController().signal,
        appPath: tempDir,
        sessionId: "s1",
        toolId: "t1",
        stage: "planning",
        role: "fixer",
      },
    );

    expect(invalidStageRes.success).toBe(false);
    if (!invalidStageRes.success) {
      expect(invalidStageRes.error.type).toBe("PermissionError");
      expect(invalidStageRes.error.message).toContain("not permitted during stage 'planning'");
    }

    // Invalid role
    const invalidRoleRes = await executeTool(
      gatedTool,
      { env: "prod" },
      {
        signal: new AbortController().signal,
        appPath: tempDir,
        sessionId: "s1",
        toolId: "t1",
        stage: "verification_passed",
        role: "builder",
      },
    );

    expect(invalidRoleRes.success).toBe(false);
    if (!invalidRoleRes.success) {
      expect(invalidRoleRes.error.type).toBe("PermissionError");
      expect(invalidRoleRes.error.message).toContain("Role 'builder' is not allowed");
    }
  });

  it("verifies all core + preview tools are registered in the default registry and can be looked up", () => {
    const registry = createDefaultRegistry();
    expect(ALL_CORE_TOOLS.length).toBe(20);

    const expectedNames = [
      "read_file",
      "write_file",
      "list_dir",
      "search_files",
      "run_command",
      "read_url",
      "screenshot",
      "get_design_tokens",
      "read_spec",
      "write_spec",
      "write_design_spec",
      "write_motion_spec",
      "install_package",
      "build_project",
      "lint_project",
      "test_project",
      "get_preview_url",
      "checkpoint",
      "log_decision",
      "spawn_subagent",
      "open_preview",
      "restart_preview",
      "preview_status",
      "stop_preview",
      "build_apk",
      "open_database_panel",
    ];

    for (const name of expectedNames) {
      expect(registry.has(name)).toBe(true);
      const tool = registry.get(name);
      expect(tool).toBeDefined();
      expect(tool?.name).toBe(name);
      expect(tool?.schema).toBeDefined();
      expect(typeof tool?.execute).toBe("function");
    }
  });
});
