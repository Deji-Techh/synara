// FILE: harnessToolPresentation.ts
// Purpose: Single source of truth for how Caide harness/Dyad agent tools render
// in the transcript (Antigravity group rows, ChatMarkdown blocks).
// Layer: Web chat presentation logic
// Exports: HarnessToolItemType, resolveHarnessToolPresentation

export type HarnessToolItemType = "command" | "read" | "edit" | "search" | "think" | "other";

export interface HarnessToolPresentation {
  readonly type: Exclude<HarnessToolItemType, "think">;
  /** Verb while the call is still running ("Writing", "Building", ...). */
  readonly running: string;
  /** Verb once the call settled ("Wrote", "Built", ...). */
  readonly completed: string;
}

function presentation(
  type: HarnessToolPresentation["type"],
  running: string,
  completed: string,
): HarnessToolPresentation {
  return { type, running, completed };
}

// Canonical harness tool names (server: harness/tools/coreTools.ts + previewTools.ts,
// dyad/tools/toolCatalog.ts caideMapping). Keys are normalized: lowercase,
// non-alphanumeric runs collapsed to a single underscore, caide_/dyad_ prefixes stripped.
const HARNESS_TOOL_PRESENTATIONS: Record<string, HarnessToolPresentation> = {
  read_file: presentation("read", "Reading", "Read"),
  list_dir: presentation("read", "Listing", "Listed"),
  list_files: presentation("read", "Listing", "Listed"),
  search_files: presentation("search", "Searching", "Searched"),
  grep_search: presentation("search", "Searching", "Searched"),
  read_url: presentation("read", "Fetching", "Fetched"),
  get_design_tokens: presentation("read", "Loading design tokens", "Loaded design tokens"),
  read_spec: presentation("read", "Reading spec", "Read spec"),
  get_preview_url: presentation("read", "Checking preview", "Checked preview"),
  preview_status: presentation("read", "Checking preview", "Checked preview"),
  screenshot: presentation("read", "Capturing screenshot", "Captured screenshot"),

  write_file: presentation("edit", "Writing", "Wrote"),
  write_spec: presentation("edit", "Writing spec", "Wrote spec"),
  write_design_spec: presentation("edit", "Writing design spec", "Wrote design spec"),
  write_motion_spec: presentation("edit", "Writing motion spec", "Wrote motion spec"),

  run_command: presentation("command", "Running", "Ran"),
  npm: presentation("command", "Running", "Ran"),
  npx_tsc: presentation("command", "Running", "Ran"),
  install_package: presentation("command", "Installing", "Installed"),
  add_dependency: presentation("command", "Installing", "Installed"),
  build_project: presentation("command", "Building", "Built"),
  lint_project: presentation("command", "Linting", "Linted"),
  run_lint: presentation("command", "Linting", "Linted"),
  run_type_checks: presentation("command", "Type-checking", "Type-checked"),
  test_project: presentation("command", "Testing", "Tested"),
  open_preview: presentation("command", "Starting preview", "Started preview"),
  restart_preview: presentation("command", "Restarting preview", "Restarted preview"),
  stop_preview: presentation("command", "Stopping preview", "Stopped preview"),
  build_apk: presentation("command", "Building APK", "Built APK"),
  run_pre_commit: presentation("command", "Running pre-commit", "Ran pre-commit"),
  restart_app: presentation("command", "Restarting app", "Restarted app"),
  reinstall_and_restart_app: presentation(
    "command",
    "Reinstalling dependencies",
    "Reinstalled dependencies",
  ),
  read_logs: presentation("read", "Reading logs", "Read logs"),
  search_chats: presentation("search", "Searching chats", "Searched chats"),
  read_chat: presentation("read", "Reading chat", "Read chat"),
  explore_chat_history: presentation("search", "Exploring history", "Explored history"),
  checkpoint: presentation("other", "Requesting approval", "Requested approval"),
  log_decision: presentation("other", "Logging decision", "Logged decision"),
  spawn_subagent: presentation("other", "Delegating", "Delegated"),
  update_todos: presentation("other", "Updating to-dos", "Updated to-dos"),
  list_agents: presentation("other", "Listing sub-agents", "Listed sub-agents"),
  wait_agents: presentation("other", "Waiting for sub-agents", "Waited for sub-agents"),
  cancel_agent: presentation("other", "Cancelling sub-agent", "Cancelled sub-agent"),
  send_message: presentation("other", "Messaging sub-agent", "Messaged sub-agent"),
  followup_task: presentation("other", "Following up with sub-agent", "Followed up with sub-agent"),

  // Plan / memory / approvals (mirrored inline like any other tool).
  write_plan: presentation("other", "Presenting plan", "Presented plan"),
  exit_plan: presentation("other", "Exiting plan mode", "Exited plan mode"),
  planning_questionnaire: presentation("other", "Asking", "Asked"),
  ask_env_vars: presentation("other", "Requesting keys", "Requested keys"),
  write_app_blueprint: presentation("other", "Drafting blueprint", "Drafted blueprint"),
  update_goal_state: presentation("other", "Updating goal", "Updated goal"),
  goal_status: presentation("other", "Checking goal", "Checked goal"),
  verify_goal: presentation("other", "Verifying goal", "Verified goal"),
  set_chat_summary: presentation("other", "Setting summary", "Set summary"),
  summarize_context: presentation("other", "Summarizing context", "Summarized context"),

  // File ops beyond the basics.
  copy_file: presentation("edit", "Copying", "Copied"),
  delete_file: presentation("edit", "Deleting", "Deleted"),
  search_replace: presentation("edit", "Editing", "Edited"),
  multi_replace: presentation("edit", "Editing", "Edited"),
  grep: presentation("search", "Searching", "Searched"),
  code_search: presentation("search", "Searching code", "Searched code"),
  explore_code: presentation("search", "Exploring code", "Explored code"),
  lsp_symbol_lookup: presentation("search", "Looking up symbol", "Looked up symbol"),

  // Git / GitHub.
  git_status: presentation("read", "Checking git status", "Checked git status"),
  git_diff: presentation("read", "Reading diff", "Read diff"),
  git_log: presentation("read", "Reading git log", "Read git log"),
  git_show_commit: presentation("read", "Reading commit", "Read commit"),
  git_show_file: presentation("read", "Reading file version", "Read file version"),
  git_commit: presentation("command", "Committing", "Committed"),
  git_restore_file: presentation("edit", "Restoring file", "Restored file"),
  github_status: presentation("read", "Checking GitHub status", "Checked GitHub status"),
  github_push: presentation("command", "Pushing", "Pushed"),
  create_github_repo: presentation("command", "Creating repo", "Created repo"),
  list_github_repos: presentation("read", "Listing repos", "Listed repos"),
  github_collaborator: presentation("other", "Managing collaborator", "Managed collaborator"),

  // Database / backend.
  execute_sql: presentation("other", "Running query", "Ran query"),
  get_database_table_schema: presentation("read", "Reading schema", "Read schema"),
  open_database_panel: presentation("other", "Opening database", "Opened database"),
  add_integration: presentation("other", "Adding integration", "Added integration"),
  create_supabase_project: presentation(
    "command",
    "Creating Supabase project",
    "Created Supabase project",
  ),
  create_neon_project: presentation("command", "Creating Neon project", "Created Neon project"),
  create_neon_branch: presentation("command", "Creating Neon branch", "Created Neon branch"),
  get_supabase_project_info: presentation("read", "Reading Supabase info", "Read Supabase info"),
  get_neon_project_info: presentation("read", "Reading Neon info", "Read Neon info"),
  deploy_supabase_functions: presentation("command", "Deploying functions", "Deployed functions"),
  supabase_test_user: presentation("other", "Testing Supabase user", "Tested Supabase user"),
  neon_test_branch: presentation("other", "Testing Neon branch", "Tested Neon branch"),
  enable_nitro: presentation("command", "Enabling Nitro", "Enabled Nitro"),

  // Share / publish / deploy.
  share_artifact: presentation("other", "Sharing artifact", "Shared artifact"),
  list_shares: presentation("read", "Listing shares", "Listed shares"),
  vercel_deploy: presentation("command", "Deploying to Vercel", "Deployed to Vercel"),
  vercel_connect: presentation("other", "Connecting Vercel", "Connected Vercel"),
  vercel_disconnect: presentation("other", "Disconnecting Vercel", "Disconnected Vercel"),
  vercel_deployments: presentation("read", "Listing deployments", "Listed deployments"),
  vercel_env_sync: presentation("command", "Syncing Vercel env", "Synced Vercel env"),
  coolify_deploy: presentation("command", "Deploying to Coolify", "Deployed to Coolify"),
  coolify_connect: presentation("other", "Connecting Coolify", "Connected Coolify"),
  coolify_disconnect: presentation("other", "Disconnecting Coolify", "Disconnected Coolify"),
  coolify_discover: presentation("read", "Discovering Coolify", "Discovered Coolify"),
  coolify_status: presentation("read", "Checking Coolify status", "Checked Coolify status"),

  // Skills / subagents / misc.
  execute_fork_skill: presentation("other", "Running skill", "Ran skill"),
  spawn_background_task: presentation(
    "other",
    "Spawning background task",
    "Spawned background task",
  ),
  check_subagent_status: presentation("read", "Checking sub-agent", "Checked sub-agent"),
  check_task_status: presentation("read", "Checking task", "Checked task"),
  verify_design: presentation("other", "Verifying design", "Verified design"),
  capture_evidence: presentation("read", "Capturing evidence", "Captured evidence"),
  capture_screenshot: presentation("read", "Capturing screenshot", "Captured screenshot"),
  generate_image: presentation("other", "Generating image", "Generated image"),
  web_fetch: presentation("read", "Fetching URL", "Fetched URL"),
  web_crawl: presentation("read", "Crawling site", "Crawled site"),
  web_search: presentation("search", "Searching web", "Searched web"),
  search_mcp_tools: presentation("search", "Searching MCP tools", "Searched MCP tools"),
  get_mcp_tool_schema: presentation("read", "Reading MCP schema", "Read MCP schema"),
  telemetry_review: presentation("other", "Reviewing telemetry", "Reviewed telemetry"),
};

export function normalizeHarnessToolName(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/^(?:caide|dyad)[-_]/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveHarnessToolPresentation(
  rawName: string | null | undefined,
): HarnessToolPresentation | null {
  if (!rawName) return null;
  const normalized = normalizeHarnessToolName(rawName);
  if (!normalized) return null;
  return HARNESS_TOOL_PRESENTATIONS[normalized] ?? null;
}
