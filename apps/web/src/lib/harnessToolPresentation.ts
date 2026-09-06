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
  checkpoint: presentation("other", "Requesting approval", "Requested approval"),
  log_decision: presentation("other", "Logging decision", "Logged decision"),
  spawn_subagent: presentation("other", "Delegating", "Delegated"),
  update_todos: presentation("other", "Updating to-dos", "Updated to-dos"),
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
