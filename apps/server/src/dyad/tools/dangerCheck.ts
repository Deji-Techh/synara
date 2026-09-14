// FILE: dangerCheck.ts
// Purpose: Static danger detectors for consent gating (donor
// plans/dangerous-action-guards.md, adapted): SQL destruction, malicious
// package names, and suspicious script content. Fast regex-only checks that
// run synchronously inside requireAgentToolConsent; a hit forces an
// ask-with-banner card (no silent auto-approve, no accept-always).

export interface DangerCheckResult {
  level: "warning" | "danger";
  category: "destructive_sql" | "malicious_package" | "suspicious_code";
  /** One concrete human sentence naming the effect (shown on the card). */
  message: string;
}

function danger(
  level: DangerCheckResult["level"],
  category: DangerCheckResult["category"],
  message: string,
): DangerCheckResult {
  return { level, category, message };
}

/** Strip -- and block comments so keywords inside comments don't trigger. */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function checkSqlDanger(sql: string): DangerCheckResult | null {
  const cleaned = stripSqlComments(sql);
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    const upper = stmt.toUpperCase();
    if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/.test(upper)) {
      const target =
        (stmt.match(/\bDROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX)\s+([^\s(;]+)/i) ?? [])[1] ?? "data";
      return danger(
        "danger",
        "destructive_sql",
        `Permanently deletes ${target} — this cannot be undone.`,
      );
    }
    if (/\bTRUNCATE\b/.test(upper)) {
      return danger(
        "danger",
        "destructive_sql",
        "Empties whole table(s) at once — all rows are lost.",
      );
    }
    if (/\bDELETE\b/.test(upper) && !/\bWHERE\b/.test(upper)) {
      return danger(
        "danger",
        "destructive_sql",
        "DELETE without a WHERE clause removes every row.",
      );
    }
    if (/\bALTER\b.*\bDROP\s+COLUMN\b/.test(upper)) {
      return danger("warning", "destructive_sql", "Drops a column (and its data) via ALTER TABLE.");
    }
    if (/\b(GRANT|REVOKE)\b/.test(upper)) {
      return danger("warning", "destructive_sql", "Changes database access grants.");
    }
  }
  if (statements.length > 1) {
    return danger(
      "warning",
      "destructive_sql",
      `Runs ${statements.length} statements in one call.`,
    );
  }
  return null;
}

const PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@.*)?$/;

function checkPackageDanger(name: string): DangerCheckResult | null {
  if (!PACKAGE_NAME_RE.test(name)) {
    return danger(
      "danger",
      "malicious_package",
      `Package name "${name.slice(0, 80)}" looks malformed — refusing to install (possible command injection).`,
    );
  }
  return null;
}

const SUSPICIOUS_PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /\/dev\/tcp\/|nc\s+-[elp]*e\s|ncat\s+.*-e\b/i,
    message: "Contains a reverse-shell pattern (network shell).",
  },
  {
    re: /coinhive|cryptonight|stratum\+tcp|xmrig/i,
    message: "Contains crypto-miner references.",
  },
  {
    re: /atob\s*\(.*\)\s*;?\s*eval|eval\s*\(\s*atob|Buffer\.from\(.*base64.*\)\s*;?\s*eval/i,
    message: "Contains obfuscated eval (encoded payload executed at runtime).",
  },
  {
    re: /child_process.*\b(bash|sh|cmd|powershell)\b/i,
    message: "Spawns a system shell from code.",
  },
];

function checkContentDanger(content: string): DangerCheckResult | null {
  for (const { re, message } of SUSPICIOUS_PATTERNS) {
    if (re.test(content)) return danger("danger", "suspicious_code", message);
  }
  return null;
}

/**
 * Dispatch detectors by tool. Returns null when nothing suspicious.
 * Only inspects NEW content (never whole files) to avoid flagging
 * pre-existing code the agent merely read.
 */
export function checkToolDanger(toolName: string, args: unknown): DangerCheckResult | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (toolName) {
    case "execute_sql": {
      const sql = str(a.query ?? a.sql);
      return sql ? checkSqlDanger(sql) : null;
    }
    case "add_dependency":
    case "install_package": {
      const name = str(a.packageName ?? a.name ?? a.package);
      return name ? checkPackageDanger(name) : null;
    }
    case "write_file":
    case "search_replace":
    case "multi_replace":
    case "write_spec":
    case "write_design_spec":
    case "write_motion_spec": {
      const content = [a.content, a.newContent, a.replacement, a.text]
        .map((v) => str(v))
        .find((s) => s.length > 0);
      return content ? checkContentDanger(content) : null;
    }
    default:
      return null;
  }
}
