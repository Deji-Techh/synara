// FILE: toolApprovalsStore.ts
// Purpose: Per-tool agent consent overrides + safe-SQL auto-approve for
// Settings → Chat behavior → Safety confirmations. Mirrors the donor consent
// defaults (dyad/tools toolCatalog); the turn layer consumes overrides via
// MemoryConsentStore in M3g persistence. Local-first until then.

export type ApprovalConsent = "ask" | "always" | "never";

export interface AskDefaultTool {
  name: string;
  label: string;
  hint: string;
}

/** Donor ask-default tools (everything else runs free unless changed here). */
export const ASK_DEFAULT_TOOLS: readonly AskDefaultTool[] = [
  { name: "execute_sql", label: "SQL queries", hint: "Safe reads can auto-approve below" },
  { name: "run_command", label: "Shell commands", hint: "Terminal + build steps" },
  { name: "add_dependency", label: "Install packages", hint: "npm / pub / deps" },
  { name: "write_plan", label: "Present plans", hint: "Plan mode gate" },
  { name: "write_app_blueprint", label: "App blueprints", hint: "New-app flow" },
  { name: "git_commit", label: "Git commits", hint: "Checkpoints" },
  { name: "run_tests", label: "Test runs", hint: "Verification" },
  { name: "run_lint", label: "Lint runs", hint: "Verification" },
  { name: "web_search", label: "Web search", hint: "External lookups" },
  { name: "web_crawl", label: "Web crawl", hint: "External lookups" },
  { name: "execute_fork_skill", label: "Skill subagents", hint: "Deferred analysis" },
  { name: "build_apk", label: "APK builds", hint: "Long mobile builds" },
];

const OVERRIDES_KEY = "caide.tool-approvals.v1";
const SAFESQL_KEY = "caide.tool-approvals.safe-sql.v1";

export function loadApprovalOverrides(): Record<string, ApprovalConsent> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, ApprovalConsent> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "ask" || v === "always" || v === "never") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveApprovalOverrides(overrides: Record<string, ApprovalConsent>): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function loadSafeSql(): boolean {
  try {
    return localStorage.getItem(SAFESQL_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveSafeSql(value: boolean): void {
  localStorage.setItem(SAFESQL_KEY, String(value));
}
