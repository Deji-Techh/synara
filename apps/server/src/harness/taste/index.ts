export interface TasteResult {
  score: number;
  passed: boolean;
  improvements: string[];
  antiSlopViolations: string[];
  motionQualityScore: number;
  visualHierarchyScore: number;
  confidence: number;
}

export interface AntiSlopCheckResult {
  violations: string[];
  improvements: string[];
}

export function evaluateAntiSlop(files: Record<string, string>): AntiSlopCheckResult {
  const violations: string[] = [];
  const improvements: string[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const lower = content.toLowerCase();

    // 1. Gradient text check
    if (
      (content.includes("bg-clip-text") || content.includes("text-transparent")) &&
      (content.includes("gradient") || content.includes("bg-gradient"))
    ) {
      violations.push(`[${filePath}] Generic AI gradient text detected.`);
      improvements.push(
        `Replace gradient text in ${filePath} with clean #FFFFFF textPrimary styling.`,
      );
    }

    // 2. Glassmorphism as card default
    if (
      (content.includes("backdrop-blur") || content.includes("backdrop-filter")) &&
      (content.includes("bg-white/10") ||
        content.includes("bg-white/5") ||
        content.includes("rgba(255"))
    ) {
      violations.push(`[${filePath}] Glassmorphism / blurred card background detected.`);
      improvements.push(
        `Use solid surface #1A1A1A or #262626 from design tokens instead of frosted glass.`,
      );
    }

    // 3. Lorem Ipsum
    if (lower.includes("lorem ipsum") || lower.includes("dolor sit amet")) {
      violations.push(`[${filePath}] Placeholder 'Lorem ipsum' text detected.`);
      improvements.push(
        `Replace dummy placeholder text in ${filePath} with realistic, domain-specific copy.`,
      );
    }

    // 4. Placeholder image domains
    if (
      content.includes("via.placeholder.com") ||
      content.includes("placehold.co") ||
      content.includes("placekitten.com")
    ) {
      violations.push(`[${filePath}] Generic placeholder image URL detected.`);
      improvements.push(
        `Use an explicit illustrated empty state or bundled vector asset in ${filePath}.`,
      );
    }

    // 5. Watermarks / AI copy
    if (
      lower.includes("powered by ai") ||
      lower.includes("generated with ai") ||
      lower.includes("created with caide")
    ) {
      violations.push(
        `[${filePath}] Unsolicited AI branding or watermark detected in user interface.`,
      );
      improvements.push(`Remove artificial AI watermarks from ${filePath}.`);
    }
  }

  return { violations, improvements };
}

export function evaluateTaste(files: Record<string, string>): TasteResult {
  const antiSlop = evaluateAntiSlop(files);
  const fileList = Object.values(files);

  // Motion Quality Check: Look for spring config or motion-spec references
  let motionQualityScore = 0.9;
  const hasMotion = fileList.some(
    (c) =>
      c.includes("stiffness") ||
      c.includes("damping") ||
      c.includes("motion-spec") ||
      c.includes("spring") ||
      c.includes("Animated.") ||
      c.includes("framer-motion"),
  );
  if (!hasMotion) {
    motionQualityScore = 0.75;
  }

  // Visual Hierarchy Check
  let visualHierarchyScore = 0.9;
  const hasTokens = fileList.some((c) => c.includes("colorTokens") || c.includes("typeScale"));
  if (!hasTokens) {
    visualHierarchyScore = 0.6;
    antiSlop.improvements.push(
      "Ensure components use typeScale tokens for clear typographic hierarchy.",
    );
  }

  // Compute composite taste score
  let baseScore = (visualHierarchyScore + motionQualityScore) / 2;
  if (antiSlop.violations.length > 0) {
    baseScore = Math.max(0.3, baseScore - antiSlop.violations.length * 0.2);
  }

  const score = Math.round(baseScore * 100) / 100;
  const passed = score >= 0.8 && antiSlop.violations.length === 0;

  return {
    score,
    passed,
    improvements: antiSlop.improvements,
    antiSlopViolations: antiSlop.violations,
    motionQualityScore,
    visualHierarchyScore,
    confidence: 0.9,
  };
}
