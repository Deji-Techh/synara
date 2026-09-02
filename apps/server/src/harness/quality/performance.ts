export interface PerformanceViolation {
  file: string;
  rule: string;
  severity: "high" | "medium" | "low";
  message: string;
  suggestedFix: string;
}

export interface PerformanceAuditResult {
  passed: boolean;
  violations: PerformanceViolation[];
}

export function auditPerformance(files: Record<string, string>): PerformanceAuditResult {
  const violations: PerformanceViolation[] = [];

  for (const [file, content] of Object.entries(files)) {
    // 1. List Virtualization Check
    // Flag rendering long arrays (>50 items) with plain .map without Virtualizer or FlatList / FlashList
    const rawLargeMapMatch = content.match(/Array\s*\(\s*(\d+)\s*\)\s*\.fill.*\.map/);
    if (rawLargeMapMatch) {
      const count = parseInt(rawLargeMapMatch[1], 10);
      if (count > 50) {
        violations.push({
          file,
          rule: "list_virtualization",
          severity: "high",
          message: `Unvirtualized list rendering ${count} items directly with .map().`,
          suggestedFix:
            "Use FlatList, FlashList, or @tanstack/react-virtual to virtualize large datasets.",
        });
      }
    }

    // 2. Unoptimized Image Check (look for raw un-sized external images)
    if (
      content.includes("<img") &&
      !content.includes('loading="lazy"') &&
      !content.includes("loading='lazy'") &&
      !content.includes("width=")
    ) {
      violations.push({
        file,
        rule: "image_optimization",
        severity: "medium",
        message: "HTML <img> tag without explicit dimensions or lazy loading.",
        suggestedFix: "Add width, height, and loading='lazy' attributes to images.",
      });
    }

    // 3. Expensive inline object creations in tight render maps
    if (content.includes(".map(") && content.includes("style={{")) {
      const occurrences = (content.match(/style=\{\{/g) || []).length;
      if (occurrences > 8) {
        violations.push({
          file,
          rule: "re_render_optimization",
          severity: "low",
          message: "High frequency of inline style objects inside render loops.",
          suggestedFix: "Extract static styles to StyleSheet or Tailwind utility classes.",
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
