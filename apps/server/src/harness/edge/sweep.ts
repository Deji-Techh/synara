export type EdgeCheckType =
  | "long_text"
  | "missing_data"
  | "empty_collection"
  | "slow_network"
  | "rapid_tap"
  | "back_navigation"
  | "orientation";

export interface EdgeCaseCheck {
  id: EdgeCheckType;
  title: string;
  description: string;
  verify: (code: string) => { passed: boolean; reason?: string };
}

export interface EdgeSweepResult {
  sliceName: string;
  passed: boolean;
  checks: Array<{
    id: EdgeCheckType;
    title: string;
    passed: boolean;
    reason?: string;
  }>;
}

export const EDGE_CHECKS: readonly EdgeCaseCheck[] = [
  {
    id: "long_text",
    title: "Long Text Truncation",
    description:
      "Ensures text elements gracefully truncate or wrap with numberOfLines or truncate CSS.",
    verify: (code: string) => {
      // Look for text handling: numberOfLines, truncate, line-clamp, text-overflow, or flex-wrap
      const hasHandling =
        code.includes("numberOfLines") ||
        code.includes("truncate") ||
        code.includes("line-clamp") ||
        code.includes("ellipsis") ||
        code.includes("flex-wrap") ||
        code.includes("overflow-hidden");
      if (!hasHandling) {
        return {
          passed: false,
          reason: "Text components lack truncation or line-clamp guards for 50+ character strings.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "missing_data",
    title: "Missing Data Fallbacks",
    description: "Ensures nullish/undefined optional fields have sensible fallback values.",
    verify: (code: string) => {
      const hasFallbacks =
        code.includes("??") ||
        code.includes("||") ||
        code.includes("?.") ||
        code.includes("default") ||
        code.includes("Boolean(");
      if (!hasFallbacks) {
        return {
          passed: false,
          reason:
            "Component lacks optional chaining (?.) or nullish coalescing (??) fallbacks for missing data.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "empty_collection",
    title: "Empty Collection Handling",
    description: "Ensures lists/collections show explicit empty state when length === 0.",
    verify: (code: string) => {
      const hasEmptyCheck =
        code.includes(".length === 0") ||
        code.includes(".length === 0") ||
        code.includes("empty") ||
        code.includes("ListEmptyComponent") ||
        code.includes("No items") ||
        code.includes("No results");
      if (!hasEmptyCheck) {
        return {
          passed: false,
          reason: "No empty state rendered when collections have 0 items.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "slow_network",
    title: "Slow Network & Loading State",
    description:
      "Ensures loading indicators or skeleton screens appear during async network operations.",
    verify: (code: string) => {
      const hasLoading =
        code.includes("loading") ||
        code.includes("isLoading") ||
        code.includes("isPending") ||
        code.includes("ActivityIndicator") ||
        code.includes("Skeleton") ||
        code.includes("Spinner");
      if (!hasLoading) {
        return {
          passed: false,
          reason: "No loading spinner or skeleton state rendered during async data fetching.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "rapid_tap",
    title: "Rapid Double-Tap Prevention",
    description:
      "Ensures submit buttons disable or debounce on tap to prevent duplicate transactions.",
    verify: (code: string) => {
      const hasDebounceOrDisable =
        code.includes("disabled=") ||
        code.includes("disabled:") ||
        code.includes("isSubmitting") ||
        code.includes("isLoading") ||
        code.includes("debounce");
      if (!hasDebounceOrDisable) {
        return {
          passed: false,
          reason:
            "Action buttons do not disable while processing, allowing rapid double-tap submission.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "back_navigation",
    title: "Back Navigation & State Preservation",
    description: "Ensures navigation preserves state or handles cancellation cleanly.",
    verify: (code: string) => {
      const hasNavHandling =
        code.includes("navigation") ||
        code.includes("useRouter") ||
        code.includes("useNavigate") ||
        code.includes("goBack") ||
        code.includes("router.back") ||
        code.includes("zustand") ||
        code.includes("useState");
      if (!hasNavHandling) {
        return {
          passed: false,
          reason: "Navigation interactions lack back handler or state preservation.",
        };
      }
      return { passed: true };
    },
  },
  {
    id: "orientation",
    title: "Responsive Orientation Resilience",
    description: "Ensures layouts use flexbox/grid and avoid fixed overflowing pixel widths.",
    verify: (code: string) => {
      const hasResponsive =
        code.includes("flex:") ||
        code.includes("flex-1") ||
        code.includes("w-full") ||
        code.includes("grid") ||
        code.includes("ScrollView") ||
        code.includes("overflow-y-auto");
      if (!hasResponsive) {
        return {
          passed: false,
          reason: "Layout lacks flex/grid container to adapt to orientation changes.",
        };
      }
      return { passed: true };
    },
  },
];

export function runEdgeSweep(sliceName: string, codeMap: Record<string, string>): EdgeSweepResult {
  const combinedCode = Object.values(codeMap).join("\n");
  const checkResults = EDGE_CHECKS.map((chk) => {
    const res = chk.verify(combinedCode);
    return {
      id: chk.id,
      title: chk.title,
      passed: res.passed,
      reason: res.reason,
    };
  });

  const passed = checkResults.every((c) => c.passed);
  return {
    sliceName,
    passed,
    checks: checkResults,
  };
}
