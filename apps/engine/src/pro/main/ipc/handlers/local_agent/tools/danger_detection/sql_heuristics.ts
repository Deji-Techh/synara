/**
 * SQL danger heuristics for the dangerCheck system.
 * Detects destructive SQL operations that should always require explicit user consent,
 * even when the user has set a tool's consent to "always".
 */

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
    explanation:
      "DROP DATABASE will permanently delete the entire database and all its data.",
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    severity: "critical",
    explanation:
      "DROP TABLE will permanently delete the table and all its data.",
  },
  {
    pattern: /\bDROP\s+SCHEMA\b/i,
    severity: "critical",
    explanation:
      "DROP SCHEMA will permanently delete the schema and all objects within it.",
  },
  {
    pattern: /\bTRUNCATE\b/i,
    severity: "critical",
    explanation:
      "TRUNCATE removes all rows from a table without a WHERE clause — this cannot be rolled back.",
  },
  {
    pattern: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i,
    severity: "high",
    explanation:
      "ALTER TABLE ... DROP COLUMN permanently removes the column and all its data.",
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w[\w.]*\s*(?:;|$)/i,
    severity: "high",
    explanation:
      "DELETE FROM without a WHERE clause will delete all rows in the table.",
  },
  {
    pattern: /\bDROP\s+(?:INDEX|FUNCTION|PROCEDURE|TRIGGER|VIEW)\b/i,
    severity: "medium",
    explanation:
      "This DROP statement will permanently remove a database object.",
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

/**
 * Strip SQL comments before pattern matching to avoid false negatives
 * from patterns embedded in comment text.
 */
function stripSqlComments(sql: string): string {
  // Remove line comments (-- ...)
  let stripped = sql.replace(/--[^\n]*/g, "");
  // Remove block comments (/* ... */)
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
  return stripped;
}

/**
 * Check a SQL string for dangerous operations.
 * Returns the highest-severity danger found, or null if the SQL is safe.
 */
export function checkSqlDanger(sql: string): DangerCheckResult | null {
  const strippedSql = stripSqlComments(sql);

  // Find the most severe danger (critical > high > medium)
  const severityOrder: DangerCheckResult["severity"][] = [
    "critical",
    "high",
    "medium",
  ];

  let worst: (SqlDangerPattern & { matched: true }) | null = null;

  for (const { pattern, severity, explanation } of SQL_DANGER_PATTERNS) {
    if (pattern.test(strippedSql)) {
      if (
        !worst ||
        severityOrder.indexOf(severity) < severityOrder.indexOf(worst.severity)
      ) {
        worst = { pattern, severity, explanation, matched: true };
      }
    }
  }

  if (!worst) return null;

  return {
    isDangerous: true,
    severity: worst.severity,
    explanation: worst.explanation,
  };
}
