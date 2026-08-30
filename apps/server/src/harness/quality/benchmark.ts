import type { ProjectFramework } from "@caide/contracts";

export interface BenchmarkBreakdown {
  visualPolish: number;
  typographyHierarchy: number;
  interactionDelight: number;
  dataDensity: number;
}

export interface BenchmarkResult {
  category: string;
  framework: ProjectFramework;
  referenceArchetype: string;
  benchmarkScore: number;
  passed: boolean;
  breakdown: BenchmarkBreakdown;
  improvements: string[];
}

export const CATEGORY_ARCHETYPES = {
  fintech: {
    reference: "Mercury / Stripe Dashboard",
    expectedFeatures: ["tabular data", "micro-charts", "monospaced figures", "status chips", "restrained palette"],
  },
  fitness: {
    reference: "Apple Fitness / Strava",
    expectedFeatures: ["bold typography", "metric rings", "high contrast accents", "activity log", "haptic feedback"],
  },
  productivity: {
    reference: "Linear / Things 3",
    expectedFeatures: ["keyboard shortcuts", "fast filter lists", "subtle borders", "compact density", "smooth animations"],
  },
  social: {
    reference: "BeReal / Threads",
    expectedFeatures: ["avatar clusters", "media cards", "pull to refresh", "fluid transitions", "reactions"],
  },
  ecommerce: {
    reference: "Shopify / Airbnb",
    expectedFeatures: ["product cards", "sticky checkout CTA", "gallery carousel", "price hierarchy", "ratings"],
  },
} as const;

export class ComparativeBenchmark {
  static runBenchmark(
    category: keyof typeof CATEGORY_ARCHETYPES | "general",
    framework: ProjectFramework,
    files: Record<string, string>,
  ): BenchmarkResult {
    const archetype =
      category in CATEGORY_ARCHETYPES
        ? CATEGORY_ARCHETYPES[category as keyof typeof CATEGORY_ARCHETYPES]
        : CATEGORY_ARCHETYPES.productivity;

    const code = Object.values(files).join("\n");
    const improvements: string[] = [];

    // 1. Visual Polish
    let visualPolish = 0.7;
    if (code.includes("colorTokens.") || code.includes("bg-[#1A1A1A]") || code.includes("rounded-2xl")) {
      visualPolish += 0.2;
    }
    if (code.includes("shadow-") || code.includes("elevation")) {
      visualPolish += 0.1;
    }

    // 2. Typography Hierarchy
    let typographyHierarchy = 0.65;
    if (code.includes("text-xs") && code.includes("text-xl") && (code.includes("font-bold") || code.includes("font-semibold"))) {
      typographyHierarchy += 0.25;
    } else {
      improvements.push("Increase typographic scale contrast between section titles, body text, and micro metadata.");
    }

    // 3. Interaction Delight
    let interactionDelight = 0.6;
    if (code.includes("stiffness") || code.includes("whileTap") || code.includes("Animated.") || code.includes("Haptics")) {
      interactionDelight += 0.3;
    } else {
      improvements.push("Add tactile micro-interactions (e.g. spring scale on press or haptic feedback) matching " + archetype.reference + ".");
    }

    // 4. Data Density & Expected Features
    let dataDensity = 0.7;
    const hasStatusChips = code.includes("badge") || code.includes("chip") || code.includes("pill") || code.includes("rounded-full");
    if (hasStatusChips) {
      dataDensity += 0.2;
    } else {
      improvements.push("Add structured status chips/badges to improve information scannability.");
    }

    const avgScore = (visualPolish + typographyHierarchy + interactionDelight + dataDensity) / 4;
    const benchmarkScore = Math.round(Math.min(1.0, avgScore) * 100) / 100;
    const passed = benchmarkScore >= 0.75;

    return {
      category,
      framework,
      referenceArchetype: archetype.reference,
      benchmarkScore,
      passed,
      breakdown: {
        visualPolish: Math.round(visualPolish * 100) / 100,
        typographyHierarchy: Math.round(typographyHierarchy * 100) / 100,
        interactionDelight: Math.round(interactionDelight * 100) / 100,
        dataDensity: Math.round(dataDensity * 100) / 100,
      },
      improvements,
    };
  }
}
