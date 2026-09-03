// FILE: sqlSafety.ts
// Purpose: SQL danger detection + consent classification.
// Donor: dyad x caide tools/danger_detection/sql_heuristics.ts (danger
// patterns verbatim, comment stripping verbatim). The mutatesSchema /
// deletesData classifier feeds shouldAutoApproveAgentTool: only
// non-schema, non-deleting SQL may skip the consent prompt.

export interface DangerCheckResult {
  isDangerous: boolean;
  severity: "critical" | "high" | "medium";
  explanation: string;
}

interface SqlDangerPattern {
  pattern: RegExp;
  severity: DangerCheckResult["severity"];
  explanation: string;
}

const SQL_DANGER_PATTERNS: SqlDangerPattern[] = [
  {
    pattern: /\bDROP\s+DATABASE\b/i,
    severity: "critical",
    explanation: "DROP DATABASE will permanently delete the entire database and all its data.",
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    severity: "critical",
    explanation: "DROP TABLE will permanently delete the table and all its data.",
  },
  {
    pattern: /\bDROP\s+SCHEMA\b/i,
    severity: "critical",
    explanation: "DROP SCHEMA will permanently delete the schema and all objects within it.",
  },
  {
    pattern: /\bTRUNCATE\b/i,
    severity: "critical",
    explanation: "TRUNCATE removes all rows from a table without a WHERE clause — this cannot be rolled back.",
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i,
    severity: "high",
    explanation: "ALTER TABLE ... DROP COLUMN permanently removes the column and all its data.",
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w[\w.]*\s*(?:;|$)/i,
    severity: "high",
    explanation: "DELETE FROM without a WHERE clause will delete all rows in the table.",
  },
  {
    pattern: /\bDROP\s+(?:INDEX|FUNCTION|PROCEDURE|TRIGGER|VIEW)\b/i,
    severity: "medium",
    explanation: "This DROP statement will permanently remove a database object.",
  },
  {
    pattern: /\bGRANT\s+ALL\b/i,
    severity: "medium",
    explanation: "GRANT ALL gives a role full permissions — review carefully.",
  },
  {
    pattern: /\bREVOKE\b/i,
    severity: "medium",
    explanation: "REVOKE removes database permissions from a user or role.",
  },
];

function stripSqlComments(sql: string): string {
  let stripped = sql.replace(/--[^\n]*/g, "");
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
  return stripped;
}

/** First matching danger pattern (comment-stripped), if any. */
export function checkSqlDanger(sql: string): DangerCheckResult {
  const clean = stripSqlComments(sql);
  for (const { pattern, severity, explanation } of SQL_DANGER_PATTERNS) {
    if (pattern.test(clean)) {
      return { isDangerous: true, severity, explanation };
    }
  }
  return { isDangerous: false, severity: "medium", explanation: "" };
}

export interface SqlClassification {
  mutatesSchema: boolean;
  deletesData: boolean;
  danger: DangerCheckResult;
}

/** Consent metadata for shouldAutoApproveAgentTool (donor semantics). */
export function classifySql(sql: string): SqlClassification {
  const clean = stripSqlComments(sql);
  const mutatesSchema = /\b(CREATE|ALTER|DROP|TRUNCATE|COMMENT\s+ON)\b/i.test(clean);
  const deletesData = /\b(DELETE|TRUNCATE|DROP)\b/i.test(clean);
  return { mutatesSchema, deletesData, danger: checkSqlDanger(sql) };
}

/** Donor rule: execute each SQL command separately, never grouped. */
export function splitStatements(sql: string): string[] {
  return stripSqlComments(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
