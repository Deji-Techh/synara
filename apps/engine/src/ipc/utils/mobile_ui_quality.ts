import * as path from "node:path";
import * as fs from "node:fs/promises";

import type { Problem } from "@/ipc/types";
import { CaideDesignSpecSchema, designSpecCompleteness } from "@/shared/design_spec";
import {
  CaideMotionSpecSchema,
  motionSpecCompleteness,
  requiredMotionPackages,
} from "@/shared/motion_spec";
import { getCaideWriteTags } from "./caide_tag_parser";

export const CAIDE_UI_QUALITY_CODE = 9001;
export const CAIDE_DESIGN_SPEC_PATH = ".caide/design-spec.json";
export const CAIDE_MOTION_SPEC_PATH = ".caide/motion-spec.json";
export const CAIDE_UI_AUDIT_REPORT_PATH = ".caide/ui-audit/latest-report.json";
const PACKAGE_JSON_PATH = "package.json";

const UI_SOURCE_EXTENSION = /\.(?:css|html|jsx|tsx|js|ts)$/i;
const UI_COMPONENT_EXTENSION = /\.(?:jsx|tsx)$/i;
const DESIGN_TOKEN_FILE =
  /(?:^|\/)(?:tokens?|themes?|globals?|index|motion)\.(?:css|scss|sass|less|ts|tsx)$/i;
const SUBSTANTIAL_ENTRY_FILE = /(?:^|\/)(?:App|Index|Home|Dashboard|Root|Layout)\.(?:jsx|tsx)$/i;
const LEGACY_BRANDING = /made\s+with\s+caide|https?:\/\/(?:www\.)?caide\.sh/i;
const DEVICE_LANGUAGE =
  /(?:main\s+)?phone\s+(?:container|frame|shell|mockup)|device\s+(?:frame|shell|mockup)|phone\s+notch|status\s+bar|home\s+indicator|camera\s+cutout/i;
const FIXED_PHONE_WIDTH =
  /(?:max-)?w-\[(?:3[2-9]\d|4[0-3]\d)px\]|(?:max-)?width\s*:\s*(?:3[2-9]\d|4[0-3]\d)px/i;
const FIXED_PHONE_HEIGHT =
  /h-\[(?:6\d\d|7\d\d|8\d\d|9\d\d|1\d{3})px\]|height\s*:\s*(?:6\d\d|7\d\d|8\d\d|9\d\d|1\d{3})px/i;
const WIDE_MIN_WIDTH =
  /min-w-\[(?:4[4-9]\d|[5-9]\d\d|\d{4,})px\]|min-width\s*:\s*(?:4[4-9]\d|[5-9]\d\d|\d{4,})px/i;
const HORIZONTAL_PAGE_SCROLL = /(?:overflow-x-(?:auto|scroll)|overflow-x\s*:\s*(?:auto|scroll))/i;
const CONSTRAINED_ROOT =
  /#root\s*\{[^}]*max-width\s*:[^;}]+;?[^}]*margin\s*:\s*0\s+auto|#root\s*\{[^}]*margin\s*:\s*0\s+auto;?[^}]*max-width\s*:/is;
const CENTERED_DOCUMENT =
  /body\s*\{[^}]*(?:display\s*:\s*flex[^}]*place-items\s*:\s*center|place-items\s*:\s*center[^}]*display\s*:\s*flex)/is;
const CONSTRAINED_APP_SHELL =
  /<(?:main|div)[^>]*className=["'`][^"'`]*(?:min-h-screen|min-h-\[100dvh\]|h-screen)[^"'`]*(?:max-w-(?:xs|sm|md|lg|xl|\[[^\]]+\])[^"'`]*mx-auto|mx-auto[^"'`]*max-w-(?:xs|sm|md|lg|xl|\[[^\]]+\]))/i;
const ICON_ONLY_BUTTON =
  /<button\b([^>]*)>\s*<(?:[A-Z][A-Za-z0-9]*(?:Icon)?|svg)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:[A-Z][A-Za-z0-9]*(?:Icon)?|svg)>)\s*<\/button>/gi;
const RAW_HEX_COLOUR = /#[0-9a-f]{3,8}\b/gi;
const TRANSITION_ALL =
  /(?:transition-all\b|transition-property\s*:\s*all\b|transition\s*:\s*["']?all\b)/i;
const INFINITE_MOTION =
  /(?:animation(?:-iteration-count)?\s*:[^;}]*(?:infinite)|\brepeat\s*:\s*Infinity\b|\brepeat\s*:\s*-1\b)/i;
const LAYOUT_PROPERTY_MOTION =
  /(?:transition(?:-property)?|animate)\s*:[^;}]*(?:width|height|top|left|right|bottom|margin|padding)/i;
const LONG_ROUTINE_MOTION =
  /(?:duration-\[(?:[7-9]\d\d|\d{4,})ms\]|(?:animation|transition)-duration\s*:\s*(?:[7-9]\d\d|\d{4,})ms)/i;

const lineDetails = (content: string, index: number) => {
  const safeIndex = Math.max(0, index);
  const before = content.slice(0, safeIndex);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = content.indexOf("\n", safeIndex);
  return {
    line,
    column: safeIndex - lineStart + 1,
    snippet: content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim(),
  };
};

const problem = (file: string, content: string, index: number, message: string): Problem => ({
  file,
  ...lineDetails(content, index),
  message,
  code: CAIDE_UI_QUALITY_CODE,
});

function scanIconOnlyButtons(file: string, content: string): Problem[] {
  if (!UI_COMPONENT_EXTENSION.test(file)) return [];
  const issues: Problem[] = [];
  for (const match of content.matchAll(ICON_ONLY_BUTTON)) {
    const attributes = match[1] ?? "";
    if (/aria-label|aria-labelledby|title\s*=/.test(attributes)) continue;
    issues.push(
      problem(
        file,
        content,
        match.index ?? 0,
        "Unlabelled icon-only control: add an explicit accessible name with aria-label or visible text.",
      ),
    );
  }
  return issues;
}

function scanTokenConsistency(file: string, content: string): Problem[] {
  if (DESIGN_TOKEN_FILE.test(file)) return [];
  const colours = new Set(
    [...content.matchAll(RAW_HEX_COLOUR)].map((match) => match[0].toLowerCase()),
  );
  if (colours.size <= 10) return [];
  const firstColour = content.search(RAW_HEX_COLOUR);
  return [
    problem(
      file,
      content,
      firstColour,
      `Design-token violation: this feature file contains ${colours.size} raw colour values. Move the palette into semantic design tokens and consume named variables or approved utilities.`,
    ),
  ];
}

function scanAiSlopCluster(file: string, content: string): Problem[] {
  const gradientCount = (content.match(/(?:bg|text)-gradient|linear-gradient/gi) ?? []).length;
  const blurCount = (content.match(/backdrop-blur|filter:\s*blur/gi) ?? []).length;
  const oversizedRadiusCount = (
    content.match(/rounded-(?:2xl|3xl|full)|border-radius:\s*(?:1\.5|2|3)rem/gi) ?? []
  ).length;
  const shadowCount = (content.match(/shadow-(?:lg|xl|2xl)|box-shadow:/gi) ?? []).length;
  if (gradientCount < 2 || blurCount < 2 || oversizedRadiusCount < 5 || shadowCount < 3) {
    return [];
  }
  const index = Math.max(0, content.search(/(?:bg|text)-gradient|linear-gradient/i));
  return [
    problem(
      file,
      content,
      index,
      "Generic AI-style cluster: gradients, glass blur, oversized radii, and heavy shadows are being used together as default decoration. Simplify the visual system and keep only effects justified by product hierarchy or layering.",
    ),
  ];
}

function scanMotionSource(file: string, content: string): Problem[] {
  const issues: Problem[] = [];
  const transitionAll = content.search(TRANSITION_ALL);
  if (transitionAll >= 0) {
    issues.push(
      problem(
        file,
        content,
        transitionAll,
        "Motion-performance violation: do not use transition-all. List only the transform, opacity, colour, or other properties that are intentionally animated.",
      ),
    );
  }
  const infinite = content.search(INFINITE_MOTION);
  if (infinite >= 0 && !/data-caide-ambient-status|caide-approved-ambient/i.test(content)) {
    issues.push(
      problem(
        file,
        content,
        infinite,
        "Uncontrolled infinite motion: remove the loop or mark a justified, pausable ambient status animation with an explicit reduced-motion fallback.",
      ),
    );
  }
  const layoutMotion = content.search(LAYOUT_PROPERTY_MOTION);
  if (layoutMotion >= 0) {
    issues.push(
      problem(
        file,
        content,
        layoutMotion,
        "Layout-thrashing motion: routine transitions must use transform and opacity rather than animating width, height, position, margin, or padding.",
      ),
    );
  }
  const longMotion = content.search(LONG_ROUTINE_MOTION);
  if (
    longMotion >= 0 &&
    !/caide-expressive-motion|data-caide-motion-purpose=["']delight/i.test(content)
  ) {
    issues.push(
      problem(
        file,
        content,
        longMotion,
        "Routine animation exceeds 600ms without an expressive-purpose marker. Shorten it or document the rare product justification in the motion storyboard.",
      ),
    );
  }
  return issues;
}

export function scanMobileUiSource(file: string, content: string): Problem[] {
  if (!UI_SOURCE_EXTENSION.test(file)) return [];

  const issues: Problem[] = [];
  const branding = content.search(LEGACY_BRANDING);
  if (branding >= 0) {
    issues.push(
      problem(
        file,
        content,
        branding,
        "CAIDE branding violation: remove visible Caide attribution, links, and badges from the generated application.",
      ),
    );
  }

  const deviceLanguage = content.search(DEVICE_LANGUAGE);
  const fixedWidth = content.search(FIXED_PHONE_WIDTH);
  const fixedHeight = content.search(FIXED_PHONE_HEIGHT);
  if (deviceLanguage >= 0 && (fixedWidth >= 0 || fixedHeight >= 0)) {
    issues.push(
      problem(
        file,
        content,
        deviceLanguage,
        "Nested device shell: CAIDE supplies the device frame. Remove simulated phone chrome and make the app root fill the real preview viewport.",
      ),
    );
  } else if (fixedHeight >= 0 && /min-h-screen|100d?vh/i.test(content)) {
    issues.push(
      problem(
        file,
        content,
        fixedHeight,
        "Fixed phone-height canvas: replace the fixed screen height with fluid min-height: 100dvh layout and responsive content constraints.",
      ),
    );
  }

  const wideMinWidth = content.search(WIDE_MIN_WIDTH);
  if (wideMinWidth >= 0) {
    issues.push(
      problem(
        file,
        content,
        wideMinWidth,
        "Mobile overflow risk: remove the desktop-sized minimum width and allow the layout to shrink to compact phone widths.",
      ),
    );
  }

  const horizontalScroll = content.search(HORIZONTAL_PAGE_SCROLL);
  if (horizontalScroll >= 0 && /body|main|min-h-screen|100d?vh/i.test(content)) {
    issues.push(
      problem(
        file,
        content,
        horizontalScroll,
        "Horizontal page scrolling is not allowed in generated mobile screens. Reflow the content responsively instead.",
      ),
    );
  }

  const constrainedRoot = content.search(CONSTRAINED_ROOT);
  if (constrainedRoot >= 0) {
    issues.push(
      problem(
        file,
        content,
        constrainedRoot,
        "App viewport is constrained by a centred #root max-width. Remove the demo root constraint so the application fills CAIDE's preview frame.",
      ),
    );
  }

  const centeredDocument = content.search(CENTERED_DOCUMENT);
  if (centeredDocument >= 0) {
    issues.push(
      problem(
        file,
        content,
        centeredDocument,
        "Document-level centring shrinks the application into a panel. Let body and #root fill the viewport; centre only intentional inner content.",
      ),
    );
  }

  const constrainedShell = content.search(CONSTRAINED_APP_SHELL);
  if (constrainedShell >= 0) {
    issues.push(
      problem(
        file,
        content,
        constrainedShell,
        "The top-level application shell is capped to a narrow centred width. Keep the root full-width and apply max-width only to inner content sections.",
      ),
    );
  }

  issues.push(...scanIconOnlyButtons(file, content));
  issues.push(...scanTokenConsistency(file, content));
  issues.push(...scanAiSlopCluster(file, content));
  issues.push(...scanMotionSource(file, content));
  return issues;
}

function substantialUiWrite(latestByPath: ReadonlyMap<string, string>) {
  const uiWrites = [...latestByPath].filter(([file]) => UI_SOURCE_EXTENSION.test(file));
  return {
    uiWrites,
    substantial:
      uiWrites.length >= 3 && uiWrites.some(([file]) => SUBSTANTIAL_ENTRY_FILE.test(file)),
  };
}

function scanDesignSpec(
  latestByPath: ReadonlyMap<string, string>,
  requireApproved = false,
): Problem[] {
  const { uiWrites, substantial } = substantialUiWrite(latestByPath);
  const designSpec = latestByPath.get(CAIDE_DESIGN_SPEC_PATH);

  if ((substantial || requireApproved) && !designSpec) {
    const [file, content] = uiWrites[0] ?? [CAIDE_DESIGN_SPEC_PATH, ""];
    return [
      problem(
        file,
        content,
        0,
        `Missing design specification: create ${CAIDE_DESIGN_SPEC_PATH} before completing substantial UI work.`,
      ),
    ];
  }
  if (!designSpec) return [];

  try {
    const parsedJson: unknown = JSON.parse(designSpec);
    const parsed = CaideDesignSpecSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return [
        problem(
          CAIDE_DESIGN_SPEC_PATH,
          designSpec,
          0,
          `Invalid CAIDE design specification: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; ")}`,
        ),
      ];
    }
    const completeness = designSpecCompleteness(parsed.data);
    if ((substantial || requireApproved) && parsed.data.status !== "approved") {
      return [
        problem(
          CAIDE_DESIGN_SPEC_PATH,
          designSpec,
          0,
          "The design specification is still draft. Complete product, screen, state, responsive, token, and quality decisions before approval.",
        ),
      ];
    }
    if (parsed.data.status === "approved" && completeness < 90) {
      return [
        problem(
          CAIDE_DESIGN_SPEC_PATH,
          designSpec,
          0,
          `Incomplete approved design specification: completeness is ${completeness}%. The release threshold is 90%.`,
        ),
      ];
    }
    return [];
  } catch (error) {
    return [
      problem(
        CAIDE_DESIGN_SPEC_PATH,
        designSpec,
        0,
        `Invalid design-spec JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }
}

function packageDependencies(packageJson: string | undefined): Set<string> | null {
  if (!packageJson) return null;
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

function scanMotionSpec(
  latestByPath: ReadonlyMap<string, string>,
  requireApproved = false,
): Problem[] {
  const { uiWrites, substantial } = substantialUiWrite(latestByPath);
  const motionSpec = latestByPath.get(CAIDE_MOTION_SPEC_PATH);

  if ((substantial || requireApproved) && !motionSpec) {
    const [file, content] = uiWrites[0] ?? [CAIDE_MOTION_SPEC_PATH, ""];
    return [
      problem(
        file,
        content,
        0,
        `Missing motion storyboard: create ${CAIDE_MOTION_SPEC_PATH} before completing substantial UI work.`,
      ),
    ];
  }
  if (!motionSpec) return [];

  try {
    const parsedJson: unknown = JSON.parse(motionSpec);
    const parsed = CaideMotionSpecSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return [
        problem(
          CAIDE_MOTION_SPEC_PATH,
          motionSpec,
          0,
          `Invalid CAIDE motion specification: ${parsed.error.issues
            .slice(0, 6)
            .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
            .join("; ")}`,
        ),
      ];
    }

    const completeness = motionSpecCompleteness(parsed.data);
    if ((substantial || requireApproved) && parsed.data.status !== "approved") {
      return [
        problem(
          CAIDE_MOTION_SPEC_PATH,
          motionSpec,
          0,
          "The motion storyboard is still draft. Define feedback, navigation, status, interruption, repeated input, reduced motion, performance budgets, assets, and audit routes before approval.",
        ),
      ];
    }
    if (parsed.data.status === "approved" && completeness < 90) {
      return [
        problem(
          CAIDE_MOTION_SPEC_PATH,
          motionSpec,
          0,
          `Incomplete approved motion storyboard: completeness is ${completeness}%. The release threshold is 90%.`,
        ),
      ];
    }

    const installed = packageDependencies(latestByPath.get(PACKAGE_JSON_PATH));
    if (installed) {
      const missing = requiredMotionPackages(parsed.data).filter(
        (dependency) => !installed.has(dependency),
      );
      if (missing.length > 0) {
        return [
          problem(
            PACKAGE_JSON_PATH,
            latestByPath.get(PACKAGE_JSON_PATH) ?? "",
            0,
            `Motion capability dependency mismatch: install ${missing.join(", ")} or select a smaller engine in ${CAIDE_MOTION_SPEC_PATH}.`,
          ),
        ];
      }
    }
    return [];
  } catch (error) {
    return [
      problem(
        CAIDE_MOTION_SPEC_PATH,
        motionSpec,
        0,
        `Invalid motion-spec JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }
}

export function scanMobileUiResponse(fullResponse: string): Problem[] {
  const latestByPath = new Map<string, string>();
  for (const write of getCaideWriteTags(fullResponse)) {
    latestByPath.set(write.path, write.content);
  }
  return [
    ...[...latestByPath].flatMap(([file, content]) => scanMobileUiSource(file, content)),
    ...scanDesignSpec(latestByPath),
    ...scanMotionSpec(latestByPath),
  ];
}

type BrowserAuditReport = {
  generatedAt?: string;
  motionSpecLoaded?: boolean;
  passed?: boolean;
  criticalIssues?: number;
  majorIssues?: number;
  scores?: {
    overall?: number;
    visual?: number;
    motion?: number;
    accessibility?: number;
    coreFlow?: number;
  };
  coreFlowResults?: Array<{ passed?: boolean }>;
  results?: Array<{
    viewport?: { id?: string };
    mode?: { id?: string };
    diagnostic?: boolean;
    throttled?: boolean;
    checkpoints?: unknown[];
    tracePath?: string;
    videoPath?: string;
  }>;
};

function scanBrowserAuditReport(
  content: string | undefined,
  latestSourceMtimeMs: number,
): Problem[] {
  if (!content) {
    return [
      problem(
        CAIDE_UI_AUDIT_REPORT_PATH,
        "",
        0,
        `Missing browser quality evidence: run the CAIDE design/motion audit and write ${CAIDE_UI_AUDIT_REPORT_PATH} after the final source change.`,
      ),
    ];
  }
  try {
    const report = JSON.parse(content) as BrowserAuditReport;
    const generatedAt = Date.parse(report.generatedAt ?? "");
    if (!Number.isFinite(generatedAt)) {
      return [
        problem(
          CAIDE_UI_AUDIT_REPORT_PATH,
          content,
          0,
          "Invalid browser quality evidence: generatedAt is missing or invalid.",
        ),
      ];
    }
    if (generatedAt + 1000 < latestSourceMtimeMs) {
      return [
        problem(
          CAIDE_UI_AUDIT_REPORT_PATH,
          content,
          0,
          "Stale browser quality evidence: source files changed after the audit. Re-run normal, reduced, diagnostic, throttled, accessibility, and core-flow checks.",
        ),
      ];
    }

    const issues: Problem[] = [];
    const add = (message: string) =>
      issues.push(problem(CAIDE_UI_AUDIT_REPORT_PATH, content, 0, message));
    if (!report.motionSpecLoaded)
      add("Browser audit did not load the approved motion specification.");
    if (!report.passed) add("Browser design/motion audit did not pass its configured thresholds.");
    if ((report.criticalIssues ?? 1) > 0) add("Browser audit contains critical issues.");
    if ((report.majorIssues ?? 1) > 0) add("Browser audit contains major issues.");
    const scores = report.scores ?? {};
    if ((scores.overall ?? 0) < 94) add("Browser audit overall score is below 94.");
    if ((scores.visual ?? 0) < 94) add("Browser audit visual score is below 94.");
    if ((scores.motion ?? 0) < 92) add("Browser audit motion score is below 92.");
    if ((scores.accessibility ?? 0) < 95) add("Browser audit accessibility score is below 95.");
    if ((scores.coreFlow ?? 0) < 98) add("Browser audit core-flow score is below 98.");
    if (!report.coreFlowResults?.length || report.coreFlowResults.some((flow) => !flow.passed)) {
      add("Browser audit is missing a passing executable primary core flow.");
    }

    const results = report.results ?? [];
    const viewports = new Set(results.map((item) => item.viewport?.id).filter(Boolean));
    const modes = new Set(results.map((item) => item.mode?.id).filter(Boolean));
    for (const required of [
      "compact-phone",
      "large-phone",
      "phone-landscape",
      "tablet-portrait",
      "tablet-landscape",
    ]) {
      if (!viewports.has(required)) add(`Browser audit is missing the ${required} viewport.`);
    }
    for (const required of ["normal-light", "normal-dark", "reduced-light"]) {
      if (!modes.has(required)) add(`Browser audit is missing ${required} mode.`);
    }
    if (!results.some((item) => item.diagnostic))
      add("Browser audit is missing slow-motion diagnostic evidence.");
    if (!results.some((item) => item.throttled))
      add("Browser audit is missing CPU-throttled evidence.");
    if (!results.some((item) => item.checkpoints?.length === 5)) {
      add("Browser audit is missing 0/25/50/75/100 transition checkpoints.");
    }
    if (!results.some((item) => typeof item.tracePath === "string" && item.tracePath.length > 0)) {
      add("Browser audit is missing Playwright trace evidence.");
    }
    if (!results.some((item) => typeof item.videoPath === "string" && item.videoPath.length > 0)) {
      add("Browser audit is missing diagnostic video evidence.");
    }
    return issues;
  } catch (error) {
    return [
      problem(
        CAIDE_UI_AUDIT_REPORT_PATH,
        content,
        0,
        `Invalid browser quality report JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }
}

async function latestRelevantMtime(appPath: string, files: readonly string[]): Promise<number> {
  const relevant = [...files, CAIDE_DESIGN_SPEC_PATH, CAIDE_MOTION_SPEC_PATH, PACKAGE_JSON_PATH];
  const times = await Promise.all(
    [...new Set(relevant)].map(async (file) => {
      try {
        return (await fs.stat(path.join(appPath, file))).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  return Math.max(0, ...times);
}

async function readOptional(appPath: string, file: string) {
  try {
    return await fs.readFile(path.join(appPath, file), "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

export async function scanMobileUiFiles(
  appPath: string,
  files: readonly string[],
): Promise<Problem[]> {
  const uniqueFiles = [...new Set(files)].filter((file) => UI_SOURCE_EXTENSION.test(file));
  const results = await Promise.all(
    uniqueFiles.map(async (file) => {
      try {
        const content = await fs.readFile(path.join(appPath, file), "utf8");
        return scanMobileUiSource(file, content);
      } catch {
        return [];
      }
    }),
  );

  try {
    const [designSpec, motionSpec, packageJson, auditReport, latestSourceMtimeMs] =
      await Promise.all([
        readOptional(appPath, CAIDE_DESIGN_SPEC_PATH),
        readOptional(appPath, CAIDE_MOTION_SPEC_PATH),
        readOptional(appPath, PACKAGE_JSON_PATH),
        readOptional(appPath, CAIDE_UI_AUDIT_REPORT_PATH),
        latestRelevantMtime(appPath, uniqueFiles),
      ]);
    const metadata = new Map<string, string>();
    if (designSpec) metadata.set(CAIDE_DESIGN_SPEC_PATH, designSpec);
    if (motionSpec) metadata.set(CAIDE_MOTION_SPEC_PATH, motionSpec);
    if (packageJson) metadata.set(PACKAGE_JSON_PATH, packageJson);
    return [
      ...results.flat(),
      ...scanDesignSpec(metadata, true),
      ...scanMotionSpec(metadata, true),
      ...scanBrowserAuditReport(auditReport, latestSourceMtimeMs),
    ];
  } catch (error) {
    return [
      ...results.flat(),
      problem(
        ".caide",
        "",
        0,
        `Unable to validate CAIDE design and motion metadata: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ];
  }
}

export interface MobileUiQualityScore {
  overall: number;
  dimensions: {
    specification: number;
    responsiveness: number;
    accessibility: number;
    consistency: number;
    distinctiveness: number;
    motion: number;
    performance: number;
  };
  issueCount: number;
}

export function scoreMobileUiResponse(fullResponse: string): MobileUiQualityScore {
  const issues = scanMobileUiResponse(fullResponse);
  const score = {
    specification: 100,
    responsiveness: 100,
    accessibility: 100,
    consistency: 100,
    distinctiveness: 100,
    motion: 100,
    performance: 100,
  };

  for (const issue of issues) {
    const message = issue.message.toLowerCase();
    if (message.includes("specification") || message.includes("storyboard"))
      score.specification -= 30;
    if (
      message.includes("viewport") ||
      message.includes("overflow") ||
      message.includes("device shell") ||
      message.includes("centr")
    ) {
      score.responsiveness -= 25;
    }
    if (message.includes("accessible name")) score.accessibility -= 20;
    if (message.includes("design-token")) score.consistency -= 20;
    if (message.includes("generic ai-style")) score.distinctiveness -= 25;
    if (
      message.includes("motion") ||
      message.includes("animation") ||
      message.includes("transition-all")
    ) {
      score.motion -= 20;
    }
    if (
      message.includes("layout-thrashing") ||
      message.includes("performance") ||
      message.includes("long task")
    ) {
      score.performance -= 25;
    }
  }

  for (const key of Object.keys(score) as Array<keyof typeof score>) {
    score[key] = Math.max(0, score[key]);
  }

  const overall = Math.round(
    score.specification * 0.15 +
      score.responsiveness * 0.2 +
      score.accessibility * 0.2 +
      score.consistency * 0.1 +
      score.distinctiveness * 0.1 +
      score.motion * 0.15 +
      score.performance * 0.1,
  );
  return { overall, dimensions: score, issueCount: issues.length };
}

export function createMobileUiQualityPrompt(problems: readonly Problem[]) {
  const details = problems
    .map(
      (item, index) => `${index + 1}. ${item.file}:${item.line}:${item.column} - ${item.message}`,
    )
    .join("\n");
  return `[System] CAIDE's design and motion quality gate rejected the current result:\n${details}\n\nRepair every issue now. Preserve or update ${CAIDE_DESIGN_SPEC_PATH} and ${CAIDE_MOTION_SPEC_PATH}; route only the required motion dependencies; use semantic design and motion tokens; keep motion interruptible and meaning-preserving under reduced motion; run executable primary core flows; write fresh browser evidence to ${CAIDE_UI_AUDIT_REPORT_PATH}; and verify normal, reduced, rapid-input, throttled, light/dark, and five-viewport behaviour before finalising.`;
}
