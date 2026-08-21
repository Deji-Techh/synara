import type { AppFrameworkType } from "@/lib/framework_constants";

// Tags must occupy their own line — guide bodies mention the literal strings
// `<nextjs-only>` / `<vite-nitro-only>` inline (e.g. "Follow the `<nextjs-only>`
// section below."), and a loose regex would gobble everything between them.
const NEXTJS_BLOCK = /^<nextjs-only>$[\s\S]*?^<\/nextjs-only>$\n?/gm;
const VITE_NITRO_BLOCK = /^<vite-nitro-only>$[\s\S]*?^<\/vite-nitro-only>$\n?/gm;
const FLUTTER_BLOCK = /^<flutter-only>$[\s\S]*?^<\/flutter-only>$\n?/gm;
const NEXTJS_TAGS = /^<\/?nextjs-only>$\n?/gm;
const VITE_NITRO_TAGS = /^<\/?vite-nitro-only>$\n?/gm;
const FLUTTER_TAGS = /^<\/?flutter-only>$\n?/gm;
// Non-global twins for existence checks — reusing the /g variants would mutate
// `lastIndex` between calls and produce inconsistent results.
const HAS_NEXTJS_BLOCK = /^<nextjs-only>$[\s\S]*?^<\/nextjs-only>$/m;
const HAS_VITE_NITRO_BLOCK = /^<vite-nitro-only>$[\s\S]*?^<\/vite-nitro-only>$/m;
const HAS_FLUTTER_BLOCK = /^<flutter-only>$[\s\S]*?^<\/flutter-only>$/m;

/**
 * Whether a guide has any content applicable to the given framework.
 *
 * - Web guides (Next.js / Vite + Nitro sections, no Flutter section) are hidden
 *   from Flutter builds — following Neon Auth or Next.js routing steps inside
 *   a Flutter app produces broken output.
 * - Guides authored as `<flutter-only>` bodies are hidden from web frameworks
 *   for the same reason.
 * - Unknown frameworks ("other", null) see everything.
 */
export function guideSupportsFramework(
  markdown: string,
  frameworkType: AppFrameworkType | null,
): boolean {
  const hasFlutterSection = HAS_FLUTTER_BLOCK.test(markdown);
  if (frameworkType === "flutter") {
    return hasFlutterSection;
  }
  if (frameworkType === "nextjs" || frameworkType === "vite" || frameworkType === "vite-nitro") {
    return !hasFlutterSection;
  }
  return true;
}

/**
 * Strip the framework section that doesn't apply to the current runtime from
 * a guide's markdown. Guides bundle the Next.js, Vite + Nitro, and/or Flutter
 * paths for ease of maintenance; we only ship the ones that match.
 *
 * Plain "vite" maps to the Vite + Nitro path because Caide adds a Nitro layer
 * when Neon is connected to a Vite app.
 *
 * Unknown frameworks ("other", null) keep both sections — the caller doesn't
 * have enough signal to choose.
 */
export function filterGuideByFramework(
  markdown: string,
  frameworkType: AppFrameworkType | null,
): string {
  const hasFlutterSection = HAS_FLUTTER_BLOCK.test(markdown);
  if (frameworkType === "flutter") {
    // Web guides carry no <flutter-only> section. Rather than throwing (the
    // caller may still embed them), strip all framework sections and return
    // whatever shared prose remains. Availability is decided by
    // guideSupportsFramework, which hides these guides from Flutter builds.
    if (!hasFlutterSection) {
      return markdown
        .replace(NEXTJS_BLOCK, "")
        .replace(VITE_NITRO_BLOCK, "")
        .replace(NEXTJS_TAGS, "")
        .replace(VITE_NITRO_TAGS, "");
    }
    return markdown
      .replace(NEXTJS_BLOCK, "")
      .replace(VITE_NITRO_BLOCK, "")
      .replace(NEXTJS_TAGS, "")
      .replace(VITE_NITRO_TAGS, "")
      .replace(FLUTTER_TAGS, "");
  }
  // Flutter-only guide on a web runtime: nothing applies.
  if (
    hasFlutterSection &&
    !HAS_NEXTJS_BLOCK.test(markdown) &&
    !HAS_VITE_NITRO_BLOCK.test(markdown)
  ) {
    return markdown.replace(FLUTTER_BLOCK, "").replace(FLUTTER_TAGS, "");
  }
  if (!HAS_NEXTJS_BLOCK.test(markdown)) {
    throw new Error("Guide is missing required <nextjs-only>...</nextjs-only> block");
  }
  if (!HAS_VITE_NITRO_BLOCK.test(markdown)) {
    throw new Error("Guide is missing required <vite-nitro-only>...</vite-nitro-only> block");
  }
  if (frameworkType === "nextjs") {
    return markdown
      .replace(VITE_NITRO_BLOCK, "")
      .replace(FLUTTER_BLOCK, "")
      .replace(NEXTJS_TAGS, "");
  }
  if (frameworkType === "vite-nitro" || frameworkType === "vite") {
    return markdown
      .replace(NEXTJS_BLOCK, "")
      .replace(FLUTTER_BLOCK, "")
      .replace(VITE_NITRO_TAGS, "");
  }
  return markdown.replace(NEXTJS_TAGS, "").replace(VITE_NITRO_TAGS, "").replace(FLUTTER_TAGS, "");
}
