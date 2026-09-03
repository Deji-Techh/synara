// FILE: tools.test.ts
// Purpose: M2 gate — tool catalog completeness + consent/inclusion semantics.

import { describe, expect, it } from "vitest";
import {
  BUILD_PROFILE_TOOLS,
  getDefaultConsent,
  getToolMeta,
  TOOL_CATALOG,
} from "./toolCatalog.ts";
import {
  clearPendingConsentsForSession,
  getAgentToolConsent,
  MemoryConsentStore,
  requireAgentToolConsent,
  resolveConsent,
  shouldAutoApproveAgentTool,
  shouldIncludeTool,
  toolNamesForTurn,
  ToolNeverAllowedError,
} from "./permissions.ts";

describe("dyad tool catalog (m2)", () => {
  it("covers the full donor inventory with donor consent defaults", () => {
    expect(TOOL_CATALOG.length).toBeGreaterThanOrEqual(48);
    const names = new Set(TOOL_CATALOG.map((t) => t.name));
    for (const expected of [
      "write_file", "search_replace", "multi_replace", "copy_file",
      "delete_file", "rename_file", "add_dependency", "execute_sql",
      "read_file", "list_files", "grep", "code_search", "explore_code",
      "get_supabase_project_info", "set_chat_summary", "add_integration",
      "read_logs", "web_search", "web_fetch", "generate_image",
      "update_todos", "run_type_checks", "run_command", "git_status",
      "git_commit", "run_tests", "capture_screenshot", "read_guide",
      "planning_questionnaire", "write_plan", "exit_plan",
      "write_app_blueprint", "search_mcp_tools", "get_mcp_tool_schema",
      "execute_sandbox_script", "spawn_subagent", "execute_fork_skill",
      "update_goal_state",
    ]) {
      expect(names, expected).toContain(expected);
    }
    // Donor consent defaults preserved.
    expect(getDefaultConsent("execute_sql")).toBe("ask");
    expect(getDefaultConsent("run_command")).toBe("ask");
    expect(getDefaultConsent("write_plan")).toBe("ask");
    expect(getDefaultConsent("write_app_blueprint")).toBe("ask");
    expect(getDefaultConsent("add_dependency")).toBe("ask");
    expect(getDefaultConsent("read_file")).toBe("always");
    expect(getDefaultConsent("unknown_tool")).toBe("ask");
    expect(getToolMeta("update_goal_state")?.caideMapping).toBe("out-of-scope");
  });

  it("carries zero Pro/engine gating", () => {
    expect(JSON.stringify(TOOL_CATALOG)).not.toMatch(/isDyadPro|usesEngineEndpoint|gateway|subscription|Pro-only/i);
    // Formerly Pro-gated tools are cataloged as available (backend pending).
    for (const name of ["web_search", "web_fetch", "generate_image", "code_search"]) {
      expect(shouldIncludeTool(name)).toBe(true);
    }
  });

  it("gates modes: plan-only withheld outside plan, state withheld when readonly", () => {
    expect(shouldIncludeTool("write_plan")).toBe(false);
    expect(shouldIncludeTool("exit_plan", {}, { planModeOnly: true })).toBe(true);
    expect(shouldIncludeTool("planning_questionnaire", {}, { planModeOnly: true })).toBe(true);
    expect(shouldIncludeTool("write_file", {}, { planModeOnly: true })).toBe(false);
    expect(shouldIncludeTool("write_file", {}, { readOnly: true })).toBe(false);
    expect(shouldIncludeTool("read_file", {}, { readOnly: true })).toBe(true);
    expect(shouldIncludeTool("execute_fork_skill")).toBe(false);
    expect(shouldIncludeTool("execute_fork_skill", {}, { includeDeferredTools: true })).toBe(true);
    expect(shouldIncludeTool("write_app_blueprint", {}, { enableAppBlueprint: false })).toBe(false);
    expect(shouldIncludeTool("spawn_subagent", {}, { buildProfile: true })).toBe(false);
    expect(shouldIncludeTool("write_file", {}, { buildProfile: true })).toBe(true);
    expect(BUILD_PROFILE_TOOLS.has("read_guide")).toBe(true);
  });

  it("honors stored never/always and auto-approves safe SQL", () => {
    const store = new MemoryConsentStore();
    store.set("grep", "never");
    expect(shouldIncludeTool("grep", {}, {}, store)).toBe(false);
    expect(getAgentToolConsent("grep", store)).toBe("never");
    expect(
      shouldAutoApproveAgentTool({
        toolName: "execute_sql",
        metadata: { sqlMutatesSchema: false, sqlDeletesData: false },
        autoApproveNonSchemaSql: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoApproveAgentTool({
        toolName: "execute_sql",
        metadata: { sqlMutatesSchema: false, sqlDeletesData: true },
        autoApproveNonSchemaSql: true,
      }),
    ).toBe(false);
  });

  it("runs the consent round-trip: always, direct answer, resolveConsent, decline, never", async () => {
    const store = new MemoryConsentStore();
    store.set("read_file", "always");
    await expect(
      requireAgentToolConsent({
        sessionId: "s1",
        toolName: "read_file",
        store,
        requestConsent: async () => {
          throw new Error("must not be called");
        },
      }),
    ).resolves.toBe(true);

    await expect(
      requireAgentToolConsent({
        sessionId: "s1",
        toolName: "grep",
        store,
        requestConsent: async () => "accept-once",
      }),
    ).resolves.toBe(true);

    const viaResolve = requireAgentToolConsent({
      sessionId: "s2",
      toolName: "run_command",
      store,
      requestConsent: async (req) => {
        setTimeout(() => resolveConsent(req.requestId, "accept-always"), 5);
        return new Promise<never>(() => {});
      },
    });
    await expect(viaResolve).resolves.toBe(true);
    expect(store.get("run_command")).toBe("always");

    await expect(
      requireAgentToolConsent({
        sessionId: "s3",
        toolName: "run_tests",
        store,
        requestConsent: async () => "decline",
      }),
    ).resolves.toBe(false);

    store.set("grep", "never");
    await expect(
      requireAgentToolConsent({
        sessionId: "s3",
        toolName: "grep",
        store,
        requestConsent: async () => "accept-once",
      }),
    ).rejects.toBeInstanceOf(ToolNeverAllowedError);
  });

  it("cancelling a session declines pending consent requests", async () => {
    const pending = requireAgentToolConsent({
      sessionId: "s9",
      toolName: "write_plan",
      store: new MemoryConsentStore(),
      requestConsent: () => new Promise<never>(() => {}),
    });
    clearPendingConsentsForSession("s9");
    await expect(pending).resolves.toBe(false);
  });

  it("toolNamesForTurn covers agent, plan, and build profiles", () => {
    const agent = toolNamesForTurn();
    expect(agent).toContain("write_file");
    expect(agent).toContain("spawn_subagent");
    expect(agent).not.toContain("write_plan");
    const plan = toolNamesForTurn({}, { planModeOnly: true });
    expect(plan).toContain("write_plan");
    expect(plan).not.toContain("write_file");
    const build = toolNamesForTurn({}, { buildProfile: true });
    expect(build).toContain("read_guide");
    expect(build).not.toContain("search_mcp_tools");
  });
});
