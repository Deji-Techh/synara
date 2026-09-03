// FILE: sandboxTools.test.ts
// Purpose: M2b gate — vm isolation/timeout/hosts, fork wiring, status
// registries, donor output shapes.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import { clampSandboxTimeoutMs, SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES } from "./limits.ts";
import {
  ALL_SANDBOX_TOOLS,
  checkSubagentStatusTool,
  checkTaskStatusTool,
  executeForkSkill,
  executeForkSkillTool,
  executeSandboxScript,
  executeSandboxScriptTool,
  listForkSkillIds,
  setSkillRunner,
} from "./sandboxTools.ts";
import {
  clearTaskRegistries,
  registerBackgroundTask,
  registerSubagentTask,
  settleBackgroundTask,
  settleSubagentTask,
} from "./taskRegistry.ts";
import { createFsHosts, runInVm } from "./vmRunner.ts";

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(20_000),
    appPath,
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

describe("dyad sandbox transplant (m2b)", () => {
  it("registers all four tools with donor previews and limits", () => {
    expect(ALL_SANDBOX_TOOLS.map((t) => t.name)).toEqual([
      "execute_sandbox_script",
      "execute_fork_skill",
      "check_task_status",
      "check_subagent_status",
    ]);
    expect(checkTaskStatusTool.presentCall?.({ task_id: "t1" })).toBe("Check task: t1");
    expect(checkSubagentStatusTool.presentCall?.({ task_id: "s1" })).toBe("Check subagent: s1");
    expect(executeForkSkillTool.presentCall?.({ skill_id: "x" })).toBe("Fork skill: x");
    expect(SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES).toBe(128 * 1024);
    expect(clampSandboxTimeoutMs(undefined)).toBe(60_000);
    expect(clampSandboxTimeoutMs(999_999_999)).toBe(60_000);
    expect(listForkSkillIds()).toContain("motion-interaction");
  });

  it("runs computations, blocks ambient authority, and times out loops", async () => {
    const ok = await runInVm("result = 40 + 2; console.log('hi');", {}, 1000);
    expect(ok.result).toBe(42);
    expect(ok.logs).toEqual(["hi"]);

    await expect(runInVm("result = process.cwd();", {}, 1000)).rejects.toThrow();
    await expect(runInVm("result = require('fs');", {}, 1000)).rejects.toThrow();
    await expect(runInVm("while (true) {}", {}, 200)).rejects.toThrow(/timed out/);
  });

  it("exposes read-only FS hosts jailed to the workspace", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-sbx-"));
    fs.writeFileSync(path.join(dir, "note.txt"), "hello sandbox");
    fs.writeFileSync(path.join(dir, "doc.md"), "hello docs");
    const hosts = createFsHosts(dir);
    expect(await hosts.read_file("note.txt")).toBe("hello sandbox");
    expect(await hosts.list_files(".")).toContain("note.txt");
    expect(await hosts.grep("hello")).toHaveLength(1);
    await expect(hosts.read_file("../../etc/passwd")).rejects.toThrow();
  });

  it("executes sandbox scripts end to end with truncation + worker note", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-sbx-"));
    fs.writeFileSync(path.join(dir, "a.txt"), "data");
    const out = (await executeSandboxScriptTool.execute(
      { script: "const files = await list_files('.');\nresult = files.join(',');", description: "List files" },
      toolCtx(dir),
    )) as string;
    expect(out).toMatch(/Sandbox script finished in \d+ms\./);
    expect(out).toContain("a.txt");

    const worker = await executeSandboxScript(
      { script: "result = 1;", execution_thread: "worker" },
      dir,
    );
    expect(worker).toContain("worker thread lands in M4");

    const big = await executeSandboxScript({ script: "result = 'y'.repeat(100000);" }, dir);
    expect(big).toContain("Output truncated");
  });

  it("forks skills through the injected runner, validating ids", async () => {
    await expect(executeForkSkill({ skill_id: "nope", task: "t" })).rejects.toThrow(/Unknown skill/);
    const unwired = await executeForkSkill({ skill_id: "motion-interaction", task: "review" });
    expect(unwired).toMatch(/not wired yet/);

    setSkillRunner(async ({ system }) => `ran with ${system.length} chars of system`);
    try {
      const out = await executeForkSkill({ skill_id: "motion-interaction", task: "review motion" });
      expect(out).toContain('<fork-skill-execution skill="motion-interaction">');
      expect(out).toContain("ran with");
    } finally {
      setSkillRunner(null);
    }
  });

  it("reads task registries with donor output shapes", async () => {
    clearTaskRegistries();
    expect(await checkTaskStatusTool.execute({ task_id: "missing" }, toolCtx("/tmp"))).toBe(
      "Error: Task ID missing not found.",
    );
    const task = registerBackgroundTask("bun run dev");
    settleBackgroundTask(task.id, { stdout: "listening", status: "completed", exitCode: 0 });
    const status = await checkTaskStatusTool.execute({ task_id: task.id }, toolCtx("/tmp"));
    expect(status).toContain("Status: completed");
    expect(status).toContain("--- STDOUT ---");

    expect(await checkSubagentStatusTool.execute({ task_id: "missing" }, toolCtx("/tmp"))).toBe(
      "Error: Subagent Task ID missing not found.",
    );
    const sub = registerSubagentTask("reviewer");
    expect(await checkSubagentStatusTool.execute({ task_id: sub.id }, toolCtx("/tmp"))).toContain(
      "is still running",
    );
    settleSubagentTask(sub.id, { status: "completed", result: { stepCount: 3, finalText: "LGTM" } });
    const done = await checkSubagentStatusTool.execute({ task_id: sub.id }, toolCtx("/tmp"));
    expect(done).toContain("completed in 3 steps");
    expect(done).toContain("LGTM");
    clearTaskRegistries();
  });
});
