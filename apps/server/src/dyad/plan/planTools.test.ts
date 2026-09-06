// FILE: planTools.test.ts
// Purpose: M2b gate — questionnaire/env-var waiter semantics, todo
// merge/replace, plan draft persistence, exit precondition, transport
// plumbing (fake transport; no WS needed).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  ALL_PLAN_TOOLS,
  askEnvVarsTool,
  executeAskEnvVars,
  executeExitPlan,
  executeQuestionnaire,
  executeWritePlan,
  exitPlanTool,
  planningQuestionnaireTool,
  PlanPreconditionError,
  PlanUiNotConnectedError,
  setPlanTransport,
  updateTodosTool,
  writePlanTool,
  type PlanTransport,
} from "./planTools.ts";
import { applyTodoUpdate, clearTodos, getTodos } from "./todoStore.ts";
import {
  clearUserInputForSession,
  dismissUserInput,
  resolveUserInput,
  waitForUserInput,
} from "./userPrompt.ts";

function toolCtx(appPath: string, sessionId = "test-session"): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId,
    toolId: "tool-test",
  };
}

function fakeTransport(events: unknown[]): PlanTransport {
  return {
    sendQuestionnaire: (sessionId, requestId, questions) =>
      events.push({ type: "questionnaire", sessionId, requestId, questions }),
    sendEnvVarRequest: (sessionId, requestId, vars) =>
      events.push({ type: "env-vars", sessionId, requestId, vars }),
    sendPlanUpdate: (sessionId, plan) => events.push({ type: "plan-update", sessionId, plan }),
    sendPlanExit: (sessionId) => events.push({ type: "plan-exit", sessionId }),
  };
}

describe("dyad plan tools transplant (m2b)", () => {
  it("registers all five plan tools with donor consent previews", () => {
    expect(ALL_PLAN_TOOLS.map((t) => t.name)).toEqual([
      "planning_questionnaire",
      "write_plan",
      "exit_plan",
      "update_todos",
      "ask_env_vars",
    ]);
    expect(planningQuestionnaireTool.presentCall?.({ questions: [{}, {}] })).toBe(
      "Questionnaire (2 questions)",
    );
    expect(writePlanTool.presentCall?.({ title: "Auth" })).toBe("Plan: Auth");
    expect(exitPlanTool.presentCall?.({})).toBe("Exit plan mode and start implementation");
    expect(
      updateTodosTool.presentCall?.({ todos: [{ status: "completed" }, { status: "pending" }] }),
    ).toBe("1/2 todos completed");
    expect(askEnvVarsTool.presentCall?.({ vars: [{ key: "STRIPE_SECRET_KEY" }] })).toBe(
      "Request keys: STRIPE_SECRET_KEY",
    );
  });

  it("fails structured when the plan UI transport is not wired", async () => {
    setPlanTransport(null);
    await expect(
      executeQuestionnaire({ questions: [{ question: "Q?", type: "text" }] }, "s"),
    ).rejects.toBeInstanceOf(PlanUiNotConnectedError);
    await expect(executeAskEnvVars({ vars: [{ key: "K" }] }, "s")).rejects.toBeInstanceOf(
      PlanUiNotConnectedError,
    );
  });

  it("runs the questionnaire round-trip and formats answers", async () => {
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    try {
      const pending = executeQuestionnaire(
        {
          questions: [
            { question: "Style?", type: "radio", options: ["A", "B"] },
            { question: "Notes?", type: "text" },
          ],
        },
        "s-qa",
      );
      const sent = events[0] as any;
      expect(sent.type).toBe("questionnaire");
      expect(sent.questions).toHaveLength(2);
      expect(sent.questions[0].id).toBeTruthy();
      resolveUserInput(sent.requestId, { [sent.questions[0].id]: "A", [sent.questions[1].id]: "none" });
      const out = await pending;
      expect(out).toContain("**Style?**\nA");
      expect(out).toContain("**Notes?**\nnone");
    } finally {
      setPlanTransport(null);
    }
  });

  it("treats dismissal as a graceful non-answer, and session-clear settles waiters", async () => {
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    try {
      const pending = executeQuestionnaire({ questions: [{ question: "Q?", type: "text" }] }, "s-x");
      dismissUserInput((events[0] as any).requestId);
      await expect(pending).resolves.toMatch(/dismissed the questionnaire/);

      const hanging = waitForUserInput("req-hang", "s-hang", "questionnaire");
      clearUserInputForSession("s-hang");
      await expect(hanging).resolves.toBeNull();
    } finally {
      setPlanTransport(null);
    }
  });

  it("persists plan drafts to .caide/plans without failing the tool", async () => {
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-plan-"));
    try {
      const out = await writePlanTool.execute(
        { title: "Auth System", summary: "Login stuff.", plan: "## Overview\nThings." },
        toolCtx(dir),
      );
      expect(out).toContain('Implementation plan "Auth System" has been presented');
      const files = fs.readdirSync(path.join(dir, ".caide", "plans"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^auth-system-\d+\.md$/);
    } finally {
      setPlanTransport(null);
    }
  });

  it("requires explicit confirmation to exit plan mode", async () => {
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    try {
      await expect(executeExitPlan({ confirmation: false }, "s-e")).rejects.toBeInstanceOf(
        PlanPreconditionError,
      );
      const out = await executeExitPlan({ confirmation: true }, "s-e");
      expect(out).toMatch(/Switching to Agent mode/);
      expect(events).toEqual([{ type: "plan-exit", sessionId: "s-e" }]);
    } finally {
      setPlanTransport(null);
    }
  });

  it("merges and replaces todos with donor validation", () => {
    clearTodos("s-t");
    applyTodoUpdate("s-t", false, [
      { id: "1", content: "First", status: "pending" },
      { id: "2", content: "Second", status: "pending" },
    ]);
    const merged = applyTodoUpdate("s-t", true, [{ id: "1", status: "in_progress" }]);
    expect(merged.find((t) => t.id === "1")).toMatchObject({ content: "First", status: "in_progress" });
    expect(() => applyTodoUpdate("s-t", true, [{ id: "3" }])).toThrow(/must have content and status/);
    expect(() => applyTodoUpdate("s-t", false, [{ id: "1", status: "pending" }])).toThrow(/must have content/);
    expect(getTodos("s-t")).toHaveLength(2);
    clearTodos("s-t");
    expect(getTodos("s-t")).toEqual([]);
  });

  it("returns env vars for the agent to save, or a graceful abort message", async () => {
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    try {
      const pending = executeAskEnvVars({ vars: [{ key: "STRIPE_SECRET_KEY" }] }, "s-env");
      const sent = events[0] as any;
      resolveUserInput(sent.requestId, { STRIPE_SECRET_KEY: "sk-test" });
      const out = await pending;
      expect(out).toContain("STRIPE_SECRET_KEY=sk-test");
      expect(out).toMatch(/\.env\.local/);

      const aborted = executeAskEnvVars({ vars: [{ key: "K" }] }, "s-env2");
      // let the tool park, then dismiss from the UI side
      await new Promise((r) => setTimeout(r, 5));
      dismissUserInput((events[events.length - 1] as any).requestId);
      await expect(aborted).resolves.toMatch(/aborted or timed out/);
    } finally {
      setPlanTransport(null);
    }
  });

  it("broadcasts todos updates when the transport supports it, degrades headless", async () => {
    clearTodos("s-todos-ev");
    const seen: Array<{ sessionId: string; todos: unknown }> = [];
    setPlanTransport({
      ...fakeTransport([]),
      sendTodosUpdate: (sessionId, todos) => seen.push({ sessionId, todos }),
    });
    try {
      const out = await updateTodosTool.execute(
        { merge: false, todos: [{ id: "1", content: "First", status: "in_progress" }] },
        toolCtx("/tmp", "s-todos-ev"),
      );
      expect(out).toMatch(/1 in progress/);
      expect(out).toMatch(/Outstanding todos/);
      expect(seen).toHaveLength(1);
      expect(seen[0].sessionId).toBe("s-todos-ev");
    } finally {
      setPlanTransport(null);
      clearTodos("s-todos-ev");
    }
    // legacy transport without the optional push still executes fine
    setPlanTransport(fakeTransport([]));
    try {
      clearTodos("s-todos-ev");
      const out = await updateTodosTool.execute(
        { merge: false, todos: [{ id: "1", content: "First", status: "pending" }] },
        toolCtx("/tmp", "s-todos-ev"),
      );
      expect(out).toMatch(/1 pending/);
    } finally {
      setPlanTransport(null);
      clearTodos("s-todos-ev");
    }
  });

  it("writes validated frontmatter drafts and records acceptance on exit", async () => {
    const { clearPlanRecords, getAcceptedPlan } = await import("./planStore.ts");
    const events: unknown[] = [];
    setPlanTransport(fakeTransport(events));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-planhandoff-"));
    const sid = "s-handoff";
    clearPlanRecords(sid);
    try {
      const presented = await writePlanTool.execute(
        { title: "Auth System", summary: "Login stuff.", plan: "## Overview\nThings." },
        toolCtx(dir, sid),
      );
      expect(presented).toContain('Implementation plan "Auth System" has been presented');
      const files = fs.readdirSync(path.join(dir, ".caide", "plans"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^auth-system-\d+\.md$/);
      const { parsePlanFile } = await import("./planStore.ts");
      const onDisk = parsePlanFile(
        fs.readFileSync(path.join(dir, ".caide", "plans", files[0]), "utf-8"),
      );
      expect(onDisk).toMatchObject({ title: "Auth System", status: "draft" });
      expect(onDisk?.id).toBeTruthy();

      const exited = await executeExitPlan({ confirmation: true }, sid);
      expect(exited).toMatch(/Switching to Agent mode/);
      expect(exited).toContain('Accepted plan: "Auth System"');
      expect(getAcceptedPlan(sid)?.status).toBe("accepted");
      const acceptedOnDisk = parsePlanFile(
        fs.readFileSync(path.join(dir, ".caide", "plans", files[0]), "utf-8"),
      );
      expect(acceptedOnDisk?.status).toBe("accepted");
    } finally {
      setPlanTransport(null);
      clearPlanRecords(sid);
    }
  });
});
