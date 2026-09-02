export interface CoherenceViolation {
  category: "spacing" | "theming" | "empty_state" | "loading_state" | "icon_pack" | "navigation";
  screens: string[];
  message: string;
  fix: string;
}

export interface CoherenceResult {
  passed: boolean;
  score: number;
  violations: CoherenceViolation[];
}

export function checkCrossAppCoherence(files: Record<string, string>): CoherenceResult {
  const violations: CoherenceViolation[] = [];
  const entries = Object.entries(files);

  // 1. Check Icon Pack Consistency
  const iconPacks = new Set<string>();
  const fileIconUsage = new Map<string, string[]>();

  for (const [file, content] of entries) {
    const packs: string[] = [];
    if (content.includes("lucide-react") || content.includes("lucide-react-native"))
      packs.push("lucide");
    if (content.includes("@heroicons/react") || content.includes("react-native-heroicons"))
      packs.push("heroicons");
    if (content.includes("phosphor-react") || content.includes("phosphor_flutter"))
      packs.push("phosphor");
    if (content.includes("@tabler/icons-react")) packs.push("tabler");
    if (content.includes("@expo/vector-icons")) packs.push("expo-vector");

    if (packs.length > 0) {
      packs.forEach((p) => iconPacks.add(p));
      fileIconUsage.set(file, packs);
    }
  }

  if (iconPacks.size > 1) {
    violations.push({
      category: "icon_pack",
      screens: Array.from(fileIconUsage.keys()),
      message: `Mixed icon packs detected across application: [${Array.from(iconPacks).join(", ")}].`,
      fix: "Standardize on a single icon library (e.g. lucide or phosphor) defined in design tokens.",
    });
  }

  // 2. Check Spacing Rhythm Consistency
  const screenPaddings = new Map<string, string>();
  for (const [file, content] of entries) {
    if (
      content.includes("padding: 23") ||
      content.includes("p-[23px]") ||
      content.includes("p-[17px]")
    ) {
      violations.push({
        category: "spacing",
        screens: [file],
        message: `Inconsistent off-grid arbitrary padding found in ${file}.`,
        fix: "Use standard 4px/8px grid spacing tokens (spacingUnit * N) from .caide/design-spec.json.",
      });
    }
  }

  // 3. Check Theming Consistency
  const darkBackgrounds = new Set<string>();
  for (const [file, content] of entries) {
    if (
      content.includes("backgroundColor: '#ff0000'") ||
      content.includes("bg-red-500 min-h-screen")
    ) {
      violations.push({
        category: "theming",
        screens: [file],
        message: `Inconsistent root screen background styling in ${file}.`,
        fix: "Apply colorTokens.background or --background token consistently to screen roots.",
      });
    }
  }

  // 4. Navigation Model Consistency
  const usesTabBar = entries.some(
    ([_, c]) => c.includes("createBottomTabNavigator") || c.includes("Tabs.List"),
  );
  const usesDrawer = entries.some(
    ([_, c]) => c.includes("createDrawerNavigator") || c.includes("Drawer.Navigator"),
  );
  if (usesTabBar && usesDrawer) {
    violations.push({
      category: "navigation",
      screens: entries.map(([f]) => f),
      message: "Mixed navigation paradigm: bottom tabs and side drawer combined haphazardly.",
      fix: "Select one primary navigation container: bottom tabs for mobile or sidebar for desktop/web.",
    });
  }

  const score = Math.max(0, 1 - violations.length * 0.2);
  const passed = violations.length === 0;

  return {
    passed,
    score: Math.round(score * 100) / 100,
    violations,
  };
}
