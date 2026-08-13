// FILE: src/build/flutterAnalyzeParse.ts
// Purpose: Parser for `flutter analyze` output -> structured issues. Keep pure
// and unit-testable; the engine's analyze/run handler uses these to feed the
// Problems pane.
// Layer: Engine analyze parsing

export type AnalyzeSeverity = "error" | "warning" | "info";

export interface AnalyzeIssue {
  readonly severity: AnalyzeSeverity;
  /** e.g. `lib/main.dart` */
  readonly path: string;
  /** 1-based, when the analyzer reports a location. */
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
  readonly code?: string;
}

/**
 * `flutter analyze` per-issue lines look like:
 *   info • Use const with static invocation • lib/main.dart:3:12 • prefer_const_constructors
 *   error • The argument ... • lib/main.dart:5:18 • argument_type_not_assignable
 * and the run ends with `N issues found.` / `No issues found!`.
 */
const ISSUE_LINE =
  /^\s*(?:error|warning|info)\s*•\s*(.*?)\s*•\s*([^:]+):(\d+):(\d+)\s*(?:•\s*(\S+))?$/;
const ISSUE_LINE_BRACKET =
  /^\s*(?:error|warning|info)\s*-\s*(.*?)\s*-\s*(.+?):(\d+):(\d+)\s*-\s*(\S+)$/;

export function parseFlutterAnalyze(output: string): {
  readonly issues: readonly AnalyzeIssue[];
  readonly issueCount: number;
} {
  const issues: AnalyzeIssue[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();
    const match = line.match(ISSUE_LINE) ?? line.match(ISSUE_LINE_BRACKET);
    if (!match) {
      continue;
    }
    const message = match[1]?.trim() ?? "";
    const location = match[2]?.trim() ?? "";
    const rawLineNo = match[3];
    const rawColumn = match[4];
    const code = match[5];
    issues.push({
      severity: line.trim().startsWith("error")
        ? "error"
        : line.trim().startsWith("warning")
          ? "warning"
          : "info",
      message,
      path: location,
      ...(Number.isFinite(Number(rawLineNo)) && Number(rawLineNo) > 0
        ? { line: Number(rawLineNo) }
        : {}),
      ...(Number.isFinite(Number(rawColumn)) && Number(rawColumn) > 0
        ? { column: Number(rawColumn) }
        : {}),
      ...(code ? { code } : {}),
    });
  }
  return { issues, issueCount: issues.length };
}
