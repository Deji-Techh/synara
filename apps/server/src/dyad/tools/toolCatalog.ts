// FILE: toolCatalog.ts
// Purpose: Full agent tool inventory — every Dyad local-agent tool with its
// consent default, state/readonly flags, mode profile, and Caide mapping.
// Donor: dyad x caide tool_definitions.ts TOOL_DEFINITIONS + per-tool
// `defaultConsent/modifiesState/isReadOnly/shouldDefer` flags (audited
// 2026-09-03). FREE-ENTIRELY changes vs donor:
// - `usesEngineEndpoint` gating DROPPED (no freeModelMode exclusion).
// - `isDyadPro` gates DROPPED: web_search/crawl/fetch + generate_image +
//   code_search/explore_code/lsp are `needsBackend` (direct provider wiring
//   lands in M2b) instead of subscription-gated.
// - `PRO_AGENT_ONLY_TOOLS` was already empty in the donor — kept empty.
// `caideMapping`: "caide-native" (exists today) | "needs-backend" (cataloged,
//   implementation pending) | "missing" (to build) | "out-of-scope".

export type ToolConsent = "ask" | "always" | "never";

export type CaideMapping =
  | "caide-native"
  | "needs-backend"
  | "missing"
  | "out-of-scope";

export interface ToolMeta {
  name: string;
  category:
    | "file-edit"
    | "read-search"
    | "verify"
    | "db-infra"
    | "web-media"
    | "plan-memory"
    | "history"
    | "subagents"
    | "mcp"
    | "git"
    | "preview";
  defaultConsent: ToolConsent;
  modifiesState: boolean;
  readOnly: boolean;
  /** Only offered in plan mode (withheld from agent/build). */
  planOnly?: boolean;
  /** Offered in plan mode despite modifying state. */
  planningSpecific?: boolean;
  /** Deferred: omitted from the initial set, loaded on request. */
  deferred?: boolean;
  /** Blueprint-gated (new-app flow). */
  blueprint?: boolean;
  /** Needs a backend not yet wired (direct provider, explorer, OAuth…). */
  needsBackend?: string;
  caideMapping: CaideMapping;
  caideTool?: string;
}

export const TOOL_CATALOG: readonly ToolMeta[] = [
  // file-edit
  { name: "write_file", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "write_file" },
  { name: "search_replace", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/editing" },
  { name: "multi_replace", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/editing" },
  { name: "copy_file", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/editing" },
  { name: "delete_file", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/editing" },
  { name: "rename_file", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/editing" },
  { name: "add_dependency", category: "file-edit", defaultConsent: "ask", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "install_package" },
  { name: "execute_sql", category: "db-infra", defaultConsent: "ask", modifiesState: true, readOnly: false, caideMapping: "missing" },
  // read-search
  { name: "read_file", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "read_file" },
  { name: "list_files", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "list_dir" },
  { name: "grep", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "search_files" },
  { name: "code_search", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, needsBackend: "BM25/code index", caideMapping: "needs-backend" },
  { name: "explore_code", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, needsBackend: "code explorer subagent", caideMapping: "needs-backend" },
  { name: "lsp_symbol_lookup", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, needsBackend: "LSP index", caideMapping: "needs-backend" },
  // db-infra
  { name: "get_supabase_project_info", category: "db-infra", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "get_neon_project_info", category: "db-infra", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "get_database_table_schema", category: "db-infra", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "set_chat_summary", category: "plan-memory", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "add_integration", category: "db-infra", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "missing" },
  { name: "enable_nitro", category: "db-infra", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "missing" },
  { name: "read_logs", category: "read-search", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "preview_status" },
  // web-media
  { name: "web_search", category: "web-media", defaultConsent: "ask", modifiesState: false, readOnly: true, needsBackend: "direct search provider", caideMapping: "needs-backend" },
  { name: "web_crawl", category: "web-media", defaultConsent: "ask", modifiesState: false, readOnly: true, needsBackend: "direct crawl provider", caideMapping: "needs-backend" },
  { name: "web_fetch", category: "web-media", defaultConsent: "always", modifiesState: false, readOnly: true, needsBackend: "direct fetch path", caideMapping: "needs-backend" },
  { name: "generate_image", category: "web-media", defaultConsent: "always", modifiesState: true, readOnly: false, needsBackend: "direct image provider", caideMapping: "needs-backend" },
  // plan-memory
  { name: "update_todos", category: "plan-memory", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/plan" },
  { name: "planning_questionnaire", category: "plan-memory", defaultConsent: "always", modifiesState: true, readOnly: false, planningSpecific: true, caideMapping: "caide-native", caideTool: "dyad/plan" },
  { name: "ask_env_vars", category: "plan-memory", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "dyad/plan" },
  { name: "write_plan", category: "plan-memory", defaultConsent: "ask", modifiesState: true, readOnly: false, planOnly: true, planningSpecific: true, caideMapping: "caide-native", caideTool: "dyad/plan" },
  { name: "exit_plan", category: "plan-memory", defaultConsent: "always", modifiesState: true, readOnly: false, planOnly: true, planningSpecific: true, caideMapping: "caide-native", caideTool: "dyad/plan" },
  { name: "write_app_blueprint", category: "plan-memory", defaultConsent: "ask", modifiesState: true, readOnly: false, blueprint: true, caideMapping: "missing" },
  // verify (+ Caide preview tools live in harness/tools/previewTools.ts)
  { name: "run_type_checks", category: "verify", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "lint_project" },
  { name: "run_command", category: "verify", defaultConsent: "ask", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "run_command" },
  { name: "run_tests", category: "verify", defaultConsent: "ask", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "test_project" },
  { name: "run_lint", category: "verify", defaultConsent: "ask", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "lint_project" },
  { name: "capture_evidence", category: "verify", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "capture_screenshot", category: "verify", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "screenshot" },
  // git
  { name: "git_status", category: "git", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "dyad/vcs" },
  { name: "git_diff", category: "git", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "dyad/vcs" },
  { name: "git_log", category: "git", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "dyad/vcs" },
  { name: "git_commit", category: "git", defaultConsent: "ask", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "dyad/vcs" },
  // history
  { name: "summarize_context", category: "history", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "read_guide", category: "history", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "caide-native", caideTool: "read_guide (dyad/guides on disk)" },
  { name: "copy_reference", category: "history", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "missing" },
  // subagents
  { name: "spawn_background_task", category: "subagents", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "spawn_subagent" },
  { name: "check_task_status", category: "subagents", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "spawn_subagent", category: "subagents", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "caide-native", caideTool: "spawn_subagent" },
  { name: "check_subagent_status", category: "subagents", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "execute_fork_skill", category: "subagents", defaultConsent: "ask", modifiesState: false, readOnly: true, deferred: true, caideMapping: "missing" },
  // mcp
  { name: "search_mcp_tools", category: "mcp", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  { name: "get_mcp_tool_schema", category: "mcp", defaultConsent: "always", modifiesState: false, readOnly: true, caideMapping: "missing" },
  // sandbox
  { name: "execute_sandbox_script", category: "file-edit", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "missing" },
  // goals (donor goal system is out of scope for Caide v1 — see plan §5 slash decision)
  { name: "update_goal_state", category: "plan-memory", defaultConsent: "always", modifiesState: true, readOnly: false, caideMapping: "out-of-scope" },
];

/** Donor plan-mode gating sets, kept verbatim in meaning. */
export const PLAN_MODE_ONLY_TOOLS: ReadonlySet<string> = new Set(["write_plan", "exit_plan"]);
export const PLANNING_SPECIFIC_TOOLS: ReadonlySet<string> = new Set([
  "write_plan",
  "exit_plan",
  "planning_questionnaire",
]);
export const APP_BLUEPRINT_TOOLS: ReadonlySet<string> = new Set(["write_app_blueprint"]);
export const CAPABILITY_GATED_BLUEPRINT_TOOLS: ReadonlySet<string> = new Set([
  "execute_sandbox_script",
]);

/**
 * Build-profile tool set (legacy XML-tag build path): read + file-edit +
 * verify + guides. No subagents, no sandbox, no MCP, no history spelunking —
 * the small model writes code with tight tools.
 */
export const BUILD_PROFILE_TOOLS: ReadonlySet<string> = new Set([
  "write_file",
  "search_replace",
  "multi_replace",
  "copy_file",
  "delete_file",
  "rename_file",
  "add_dependency",
  "read_file",
  "list_files",
  "grep",
  "read_logs",
  "run_type_checks",
  "run_command",
  "run_tests",
  "run_lint",
  "capture_screenshot",
  "read_guide",
  "set_chat_summary",
  "git_status",
  "git_diff",
  "git_log",
  "open_preview",
  "preview_status",
  "get_preview_url",
]);

export function getToolMeta(name: string): ToolMeta | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}

export function getDefaultConsent(name: string): ToolConsent {
  return getToolMeta(name)?.defaultConsent ?? "ask";
}
