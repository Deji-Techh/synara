import { designTokens, colorTokens } from "../../design/tokens.ts";

export interface TokenViolation {
  filePath: string;
  line?: number;
  type: "color" | "touch_target" | "missing_state" | "type_scale" | "anti_slop";
  message: string;
  suggestedFix: string;
}

export interface TokenAuditResult {
  passed: boolean;
  score: number;
  violations: TokenViolation[];
  issues: string[];
}

export function auditFileTokens(filePath: string, content: string): TokenViolation[] {
  const violations: TokenViolation[] = [];
  const lines = content.split("\n");

  const isScreenFile =
    filePath.includes("Screen") ||
    filePath.includes("View") ||
    filePath.includes("page") ||
    filePath.includes("screens/");

  // 1. Mandatory States Audit (for screen files)
  if (isScreenFile) {
    // Strip comments to prevent false positives from code comments
    const codeWithoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    const hasEmptyState =
      /\b(empty|no items|no data|not found|EmptyState|no products|no results|emptyState)\b/i.test(
        codeWithoutComments,
      );
    const hasLoadingState =
      /\b(loading|isLoading|ActivityIndicator|Skeleton|Spinner|loadingState)\b/i.test(
        codeWithoutComments,
      );
    const hasErrorState =
      /\b(error|isError|onError|retry|onRetry|Failed to|ErrorBanner|errorState)\b/i.test(
        codeWithoutComments,
      );

    if (!hasEmptyState) {
      violations.push({
        filePath,
        type: "missing_state",
        message: `Missing mandatory Empty State in screen file '${filePath}'.`,
        suggestedFix: "Implement an empty state illustration/icon, headline, message, and CTA.",
      });
    }
    if (!hasLoadingState) {
      violations.push({
        filePath,
        type: "missing_state",
        message: `Missing mandatory Loading State in screen file '${filePath}'.`,
        suggestedFix: "Implement loading skeleton or activity indicator matching design tokens.",
      });
    }
    if (!hasErrorState) {
      violations.push({
        filePath,
        type: "missing_state",
        message: `Missing mandatory Error State in screen file '${filePath}'.`,
        suggestedFix: "Implement an error banner or retryable card for async failure handling.",
      });
    }
  }

  // 2. Line-by-line checks
  lines.forEach((lineText, index) => {
    const lineNum = index + 1;

    // A. Anti-AI Slop Gradient check
    if (
      lineText.includes("linear-gradient") &&
      (lineText.includes("#8B5CF6") || lineText.includes("#3B82F6") || lineText.includes("purple"))
    ) {
      violations.push({
        filePath,
        line: lineNum,
        type: "anti_slop",
        message: `Generic AI gradient detected on line ${lineNum}.`,
        suggestedFix: "Use dark background #0D0D0D with crisp #E8493C accent punch instead.",
      });
    }

    // B. Touch Target Audit (< 44px)
    // Matches touchable styles where height is explicitly smaller than 44 (e.g., height: 28, height: 32, minHeight: 30)
    const smallHeightMatch = lineText.match(/(?:minHeight|height)\s*:\s*([0-9]+)/);
    if (smallHeightMatch) {
      const heightVal = parseInt(smallHeightMatch[1], 10);
      if (
        heightVal > 0 &&
        heightVal < 44 &&
        (lineText.includes("TouchableOpacity") ||
          lineText.includes("Pressable") ||
          lineText.includes("Button") ||
          lineText.includes("padding") ||
          lines[Math.max(0, index - 2)].includes("Touchable") ||
          lines[Math.min(lines.length - 1, index + 2)].includes("Touchable"))
      ) {
        violations.push({
          filePath,
          line: lineNum,
          type: "touch_target",
          message: `Touch target height (${heightVal}px) on line ${lineNum} is under the 44px accessibility minimum.`,
          suggestedFix: "Set minHeight: 44 to ensure comfortable touch target accessibility.",
        });
      }
    }

    // C. Hardcoded raw hex color check where token should be used
    if (
      (lineText.includes("backgroundColor:") || lineText.includes("color:")) &&
      lineText.includes("#0D0D0D") &&
      !lineText.includes("colorTokens")
    ) {
      violations.push({
        filePath,
        line: lineNum,
        type: "color",
        message: `Hardcoded raw hex color '#0D0D0D' on line ${lineNum} instead of using 'colorTokens.background'.`,
        suggestedFix: "Import and use 'colorTokens.background' from design tokens.",
      });
    }

    if (
      (lineText.includes("backgroundColor:") || lineText.includes("color:")) &&
      lineText.includes("#E8493C") &&
      !lineText.includes("colorTokens")
    ) {
      violations.push({
        filePath,
        line: lineNum,
        type: "color",
        message: `Hardcoded raw hex color '#E8493C' on line ${lineNum} instead of using 'colorTokens.accent'.`,
        suggestedFix: "Import and use 'colorTokens.accent' from design tokens.",
      });
    }
  });

  return violations;
}

export function auditProjectTokens(files: Record<string, string>): TokenAuditResult {
  const allViolations: TokenViolation[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const fileViolations = auditFileTokens(filePath, content);
    allViolations.push(...fileViolations);
  }

  const issues = allViolations.map((v) =>
    v.line ? `[${v.filePath}:${v.line}] ${v.message} (Fix: ${v.suggestedFix})` : `[${v.filePath}] ${v.message} (Fix: ${v.suggestedFix})`,
  );

  const passed = allViolations.length === 0;
  const score = Math.max(0, 1 - allViolations.length * 0.15);

  return {
    passed,
    score: Math.round(score * 100) / 100,
    violations: allViolations,
    issues,
  };
}
