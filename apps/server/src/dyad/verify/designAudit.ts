// FILE: designAudit.ts
// Purpose: verify_design agent tool — static design-quality audit of the app
// workspace (items 1-13). Read-only: icon-family mixing, flat-color initials
// product art, missing dark mode, missing design/motion specs, mock-data
// markers, reduced-motion, accessibility props. Findings are major/minor so
// the agent can fix majors before declaring UI work complete.

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

export interface DesignFinding {
  level: "major" | "minor";
  file?: string;
  check: string;
  message: string;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".caide", "dist", "build", ".expo", "ios", "android", ".dart_tool"]);

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".dart", ".css"]);

const REQUIRED_TOKEN_KEYS = ["accent", "background", "surface", "textPrimary", "textMuted"];

const FIVE_VIEWPORTS = ["compact-phone", "large-phone", "phone-landscape", "tablet-portrait", "tablet-landscape"];

function listSourceFiles(root: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) listSourceFiles(full, out, depth + 1);
    else if (SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
      if (out.length >= 400) return out;
    }
  }
  return out;
}

function readFileSafe(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 300_000) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readJsonSafe(file: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

const verifyDesignSchema = z.object({
  scope: z.enum(["ui", "all"]).optional().describe("Audit scope (default ui). 'all' adds motion-spec enforcement for multi-screen apps."),
});

export function auditDesignWorkspace(appPath: string, scope: "ui" | "all" = "ui"): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const files = listSourceFiles(appPath);
  const rel = (f: string) => path.relative(appPath, f);

  // --- design-spec.json (contract: packages/contracts designSpec.ts) ---
  const designSpec = readJsonSafe(path.join(appPath, ".caide", "design-spec.json")) as Record<string, unknown> | undefined;
  if (!designSpec || typeof designSpec !== "object") {
    findings.push({ level: "major", check: "design-spec", message: "Missing .caide/design-spec.json — create it before UI work (tokens, screens, dark mode, imagery strategy)." });
  } else {
    const tokens = (designSpec.colorTokens ?? {}) as Record<string, unknown>;
    for (const key of REQUIRED_TOKEN_KEYS) {
      if (typeof tokens[key] !== "string" || !(tokens[key] as string).trim()) {
        findings.push({ level: "major", check: "design-spec", message: `colorTokens.${key} missing or empty in .caide/design-spec.json.` });
      }
    }
    const dark = designSpec.darkMode as Record<string, unknown> | undefined;
    if (!dark || dark.enabled !== true) {
      findings.push({ level: "major", check: "dark-mode", message: "design-spec darkMode.enabled is not true — every screen must render in light AND dark from day one." });
    }
    const imagery = designSpec.imagery as Record<string, unknown> | undefined;
    if (!imagery || typeof imagery.strategy !== "string") {
      findings.push({ level: "minor", check: "imagery", message: "design-spec imagery.strategy unset — lock generated | user-provided | illustrated-placeholder | mixed." });
    }
    const viewports = Array.isArray(designSpec.viewportsVerified) ? (designSpec.viewportsVerified as unknown[]) : [];
    const missing = FIVE_VIEWPORTS.filter((v) => !viewports.includes(v));
    if (missing.length > 0) {
      findings.push({ level: "minor", check: "viewports", message: `Viewports not yet verified: ${missing.join(", ")}.` });
    }
  }

  // --- motion-spec.json ---
  const motionSpec = readJsonSafe(path.join(appPath, ".caide", "motion-spec.json")) as Record<string, unknown> | undefined;
  const screenCount = files.filter((f) => /screen|page|_layout|router\.dart/i.test(f)).length;
  if (!motionSpec || !Array.isArray(motionSpec.entries)) {
    findings.push({
      level: scope === "all" || screenCount > 3 ? "major" : "minor",
      check: "motion-spec",
      message: "Missing .caide/motion-spec.json entries — storyboard every consequential state change (trigger, technique, engine, timing, interruption, reduced-motion fallback).",
    });
  } else if ((motionSpec.entries as unknown[]).some((e) => typeof (e as Record<string, unknown>).reducedMotionFallback !== "string")) {
    findings.push({ level: "minor", check: "motion-spec", message: "Some motion entries lack reducedMotionFallback — honor reduce-motion on every animation." });
  }

  // --- per-file static checks ---
  let iconFamilies = new Set<string>();
  let darkHits = 0;
  let motionHits = 0;
  let a11yMissing = 0;
  for (const file of files) {
    const text = readFileSafe(file);
    if (!text) continue;
    const r = rel(file);
    if (/initials/i.test(text) && /backgroundColor/i.test(text)) {
      findings.push({ level: "major", file: r, check: "imagery", message: "Flat-color initials block detected — never ship initials-on-color as product photos; use generate_image or the image-asset patterns." });
    }
    if (/@expo\/vector-icons|Ionicons|MaterialIcons|FontAwesome|Feather/.test(text)) iconFamilies.add("vector-icons");
    if (/expo-symbols|SF Symbols|sf:/.test(text)) iconFamilies.add("sf-symbols");
    if (/CupertinoIcons|Cupertino/.test(text)) iconFamilies.add("cupertino");
    if (/useColorScheme|ColorScheme|dark-first|Brightness\.dark|ThemeMode\.dark|dark: ?["']/.test(text)) darkHits++;
    if (/reduce-?motion|ReduceMotion|prefers-reduced-motion|AccessibilityInfo.*reduce|animateWithReducedMotion/i.test(text)) motionHits++;
    if (/(Pressable|TouchableOpacity|TouchableHighlight|InkWell|GestureDetector)/.test(text) && !/accessibility(Role|Label|Hint)/.test(text)) {
      a11yMissing++;
      if (a11yMissing <= 5) {
        findings.push({ level: "minor", file: r, check: "accessibility", message: "Interactive element without accessibilityRole/Label — add labels; keep 44px minimum targets." });
      }
    }
    const mock = text.match(/\b(lorem ipsum|TODO: replace|placeholder-replace-with)\b/i);
    if (mock) {
      findings.push({ level: "minor", file: r, check: "mock-data", message: `Mock-data marker "${mock[0]}" — replace with real content or an authentic empty state.` });
      if (findings.filter((f) => f.check === "mock-data").length >= 5) break;
    }
  }
  if (iconFamilies.size >= 3) {
    findings.push({ level: "major", check: "icons", message: `Mixed icon families (${[...iconFamilies].join(", ")}) — one family per app (SF Symbols on iOS).` });
  } else if (iconFamilies.size === 2) {
    findings.push({ level: "minor", check: "icons", message: `Two icon families (${[...iconFamilies].join(", ")}) — converge on one.` });
  }
  if (files.length > 0 && darkHits === 0) {
    findings.push({ level: "major", check: "dark-mode", message: "No dark-mode code detected (useColorScheme/ColorScheme/dark theme) — light-only UI fails the definition of done." });
  }
  if (files.length > 5 && motionHits === 0) {
    findings.push({ level: "minor", check: "motion", message: "No reduced-motion handling detected — honor reduce-motion on every animation." });
  }

  // --- web viewport + responsive checks (5 viewport classes) ---
  const pkg = readJsonSafe(path.join(appPath, "package.json")) as Record<string, unknown> | undefined;
  const deps = {
    ...((pkg?.dependencies ?? {}) as Record<string, unknown>),
    ...((pkg?.devDependencies ?? {}) as Record<string, unknown>),
  };
  const indexHtml = readFileSafe(path.join(appPath, "index.html"));
  const isWeb = indexHtml !== null || ["vite", "next", "react", "tailwindcss", "@vitejs/plugin-react"].some((k) => deps[k] !== undefined);
  if (isWeb) {
    if (indexHtml !== null && !/<meta[^>]+name=["']viewport["']/i.test(indexHtml)) {
      findings.push({ level: "major", file: "index.html", check: "viewports", message: "Missing <meta name=\"viewport\"> — responsive viewports cannot work without it." });
    }
    let responsiveHits = 0;
    let fixedWidthReports = 0;
    for (const file of files) {
      const text = readFileSafe(file);
      if (!text) continue;
      if (/(sm:|md:|lg:|xl:|2xl:|@media|container-type|useMediaQuery|useWindowDimensions|Dimensions\.get)/.test(text)) {
        responsiveHits++;
      }
      const fixed = text.match(/w-\[3[79]0px\]|width:\s*39[07]px/);
      if (fixed && fixedWidthReports < 3) {
        fixedWidthReports++;
        findings.push({ level: "minor", file: rel(file), check: "viewports", message: `Fixed phone width "${fixed[0]}" — recompose per viewport class instead of locking 375/390px.` });
      }
    }
    if (responsiveHits === 0) {
      findings.push({ level: "minor", check: "viewports", message: "No responsive rules detected (breakpoints, media/container queries, Dimensions) — tablet and landscape will reuse the phone column." });
    }
  }
  return findings;
}

export const verifyDesignTool = defineTool({
  name: "verify_design",
  description: [
    "Static design-quality audit of the app workspace. Run it before declaring UI work complete.",
    "Checks: .caide/design-spec.json shape (tokens, darkMode.enabled, imagery strategy, viewports),",
    ".caide/motion-spec.json entries + reduced-motion fallbacks, flat-color initials product art,",
    "mixed icon families, missing dark-mode code, mock-data markers, reduced-motion handling,",
    "interactive elements without accessibility props, and (web apps) viewport meta,",
    "responsive rules, and fixed phone-width locks.",
  ].join(" "),
  schema: verifyDesignSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = verifyDesignSchema.parse(args);
    const findings = auditDesignWorkspace(ctx.appPath, parsed.scope ?? "ui");
    const majors = findings.filter((f) => f.level === "major");
    const minors = findings.filter((f) => f.level === "minor");
    const head = findings.length === 0
      ? "Design audit clean: 0 findings."
      : `Design audit: ${majors.length} major, ${minors.length} minor.`;
    const lines = findings.map((f) => `- [${f.level}] ${f.check}${f.file ? ` (${f.file})` : ""}: ${f.message}`);
    return [head, ...lines].join("\n");
  },
  presentCall: () => "Audit design quality",
});

export const ALL_VERIFY_TOOLS: ToolDef[] = [verifyDesignTool];
