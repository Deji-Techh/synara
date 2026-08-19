import { stripFrontmatter } from "./skill_frontmatter";
import type { AppFrameworkType } from "@/lib/framework_constants";
import { rawAsset } from "@/raw-assets";
const onboardingWelcomeSkill = rawAsset("src/prompts/skills/onboarding-welcome/SKILL.md");
const welcomeScreensAudit = rawAsset("src/prompts/skills/onboarding-welcome/references/top-welcome-screens.md");
const motionInteractionSkill = rawAsset("src/prompts/skills/motion-interaction/SKILL.md");
const productFlowSkill = rawAsset("src/prompts/skills/product-flow/SKILL.md");
const backendProductionSkill = rawAsset("src/prompts/skills/backend-production/SKILL.md");
const uiUxCoreAudit = rawAsset("src/prompts/skills/ui-ux-mastery/references/quality-rubric.md");
const accessibilityAudit = rawAsset("src/prompts/skills/ui-ux-mastery/references/accessibility.md");
const platformPatternsAudit = rawAsset("src/prompts/skills/ui-ux-mastery/references/platform-patterns.md");
const antiSlopAudit = rawAsset("src/prompts/skills/ui-ux-mastery/references/anti-slop.md");

/**
 * Harness-driven iteration ("checkpoint chain"): after a substantive build,
 * the agent runs a deterministic chain of focused design passes instead of one
 * giant mono-prompt. Each pass gets its own turn with a minimal skill-specific
 * prompt, with retry-once on zero-change passes and hard pass caps.
 *
 * The chain is never keyword-gated. A social media app request that says
 * nothing about "animation" still gets the motion-interaction pass, because
 * every build runs the always-on core. Conditional passes widen the chain per
 * app context (new app, onboarding screens, backend code), but the core
 * (ui-ux-core, motion, accessibility, platform-patterns, anti-ai-slop) is
 * never trimmed by the pass cap.
 */

export type CheckpointPassId =
  | "product-flow"
  | "onboarding-welcome"
  | "welcome-screens"
  | "ui-ux-core"
  | "motion-interaction"
  | "accessibility"
  | "platform-patterns"
  | "backend-production"
  | "anti-ai-slop";

export type CheckpointPass = { id: CheckpointPassId; body: string };

const FLUTTER_PASS_BODIES: Record<CheckpointPassId, string> = {
  "product-flow": `# Checkpoint pass — FLUTTER PRODUCT FLOW

Audit the Dart app as a complete product journey. Apply the skill contract below to the Flutter widget tree.

- Trace every primary flow through its real widgets: launch state, main shell (NavigationBar destinations), navigation (go_router or Navigator), data loading, and the destination screens. Every flow must be runnable end-to-end in the running app.
- Every screen state exists in code: loading, empty, error (with retry), offline where relevant. No screen shows a blank scaffold on load.
- Navigation is coherent: one navigation model; every destination reachable and back-able (\`PopScope\` honored); no dead-end leaves.
- State management matches app size (setState/ValueNotifier/provider/riverpod/bloc) with business logic out of \`build()\`; controllers/streams are disposed.
- Real product content, not placeholder text or hard-coded lorem.

Change only what actually violates the contract for this pass; do not redesign unrelated screens.
`,
  "onboarding-welcome": `# Checkpoint pass — FLUTTER ONBOARDING & WELCOME

Audit onboarding/welcome flows in the Dart widget tree (splash + welcome screens).

- Splash/welcome screens use Material idioms (safe-area-aware Scaffold, \`Hero\`/\`AnimatedSwitcher\` transitions appreciated, reduced-motion respected via \`MediaQuery.disableAnimationsOf\`).
- Animated welcome moments are measured and tasteful (Material timings), never endless spin or fake progress.
- Actions are semantic and labeled (\`semanticLabel\`, \`Tooltip\`, 48dp targets, contrast >= 4.5:1); skip affordances exist; state (e.g. page indicator) is announced.
- Branding is applied from the app's theme/design tokens, not ad-hoc colors per screen.
`,
  "welcome-screens": `# Checkpoint pass — FLUTTER WELCOME SCREENS CRAFT

Recreate the welcome/splash craft contracts in Flutter widgets.

- Welcome screens are \`StatelessWidget\`/small \`StatefulWidget\` compositions that respond to layout and text scale; no fixed 390x780 canvas.
- Motion timings follow Material (micro 150-250ms, expressive 300-500ms), run once (no repeat), and are gated behind reduced-motion.
- Design is distinctive: real gradient-free, token-driven Material styling; no emoji-as-icons, no generic template layout.
`,
  "ui-ux-core": `# Checkpoint pass — FLUTTER UI/UX CORE

Audit the Flutter app against the premium-application quality rubric below. Judge actual Dart widget trees, not the preview screenshot alone.

- Visual hierarchy and typography from a seeded ColorScheme + TextTheme; spacing/radius/duration tokens, no magic constants, no \`ThemeData\` redefinitions per screen.
- Layouts fill the frame at all five viewport classes (320x568, 390x844, 844x390, 768x1024, 1024x768) via LayoutBuilder/MediaQuery; no horizontal overflow, no clipped actions, no stretched phone gutters on tablet.
- Every screen has loading/empty/error states; interactive controls are >= 48dp with focus + press feedback; dark/light both coherent.
- One clear primary action per screen; deliberate, premium, not generic.

Before finishing, run \`flutter analyze\` and fix any introduced warnings.
`,
  "motion-interaction": `# Checkpoint pass — FLUTTER MOTION & INTERACTION

Audit motion in the Dart widget tree.

- Implicit animation used first (AnimatedContainer/AnimatedSwitcher/TweenAnimationBuilder); AnimationController only where explicit control is warranted, disposed on dispose.
- Timings per Material: press 50-120ms, quick state 150-250ms, local 200-300ms, navigation 300-500ms, expressive 400-700ms; one easing family.
- Every significant transition is interruptible, defines rapid repeated-input behavior, and preserves meaning under \`MediaQuery.disableAnimationsOf\`.
- No uncontrolled infinite animation, no queued press animations, no motion restarting on unrelated rebuilds, no layout-thrashing layout animations.
`,
  accessibility: `# Checkpoint pass — FLUTTER ACCESSIBILITY

Audit the Flutter app's a11y in the widget tree.

- Semantics labels on all icon-only controls + Tooltips; \`Semantics\`/lists announce state (toggled, selected); hit targets >= 48x48 logical px.
- Contrast >= 4.5:1 for body text; large-text layout works via \`MediaQuery.textScaler\` (no clipped text, no overflow errors).
- Keyboard/switch traversal works: \`FocusTraversalGroup\`, visible focus, autofocus sane; \`MediaQuery.accessibleNavigation\` paths don't dead-end.
- Buttons/links have meaningful labels; images/branded text get appropriate semantic descriptions.
`,
  "platform-patterns": `# Checkpoint pass — FLUTTER PLATFORM PATTERNS

Audit platform-native behavior in the Dart app.

- Material idioms throughout: NavigationBar on phone, NavigationRail on tablet/desktop (LayoutBuilder switch), sheets/dialogs where expected, \`SnackBar\` feedback.
- Safe-area and keyboard insets honored via MediaQuery padding/viewInsets; edge-to-edge where platforms expect it.
- Back navigation semantics correct (\`PopScope\`, back button closes sheets before leaving the app); deep links via go_router when the product needs them.
- Motion adapts when navigation changes shape (bottom bar <-> rail); single coherent navigation model.
`,
  "backend-production": `# Checkpoint pass — FLUTTER BACKEND PRODUCTION

Audit backend/API wiring for the Flutter app (services in Dart, plus any server code).

- Services/repositories are lean and injectable; no HTTP inside widgets; response models parse with explicit fromJson; errors surfaced as user-facing error states with retry.
- Loading/empty/error/offline handled on every data screen; timeouts, cancellation (\`CancelToken\`/dispose), and connectivity failures handled.
- Secrets are never hard-coded in Dart; env/config via \`--dart-define\` or a config service; no credentials committed.
`,
  "anti-ai-slop": `# Checkpoint pass — FLUTTER ANTI-AI-SLOP

Apply the premium distinctiveness contract to the Flutter app.

- Real, distinctive theming (seeded ColorScheme, tokens, real product content); no default-counter template, no placeholder data in UI (authentic empty states instead).
- No over-engineering: state library, DI, or abstractions only where the app size justifies them; no speculative features.
- No magic constants, one navigation model, consistent naming, Material idioms; no emoji-as-icons; no fake metrics/charts/cards-for-the-sake-of-cards.
- The app should feel like a designed premium product, not an AI-generated scaffold.
`,
};

const PASS_BODIES: Record<CheckpointPassId, string> = {
  "product-flow": stripFrontmatter(productFlowSkill),
  "onboarding-welcome": stripFrontmatter(onboardingWelcomeSkill),
  // The top-welcome-screens study (10 animated splash/welcome screens:
  // Duolingo, Strava, MyFitnessPal, Yazio, Hallow, SCRL, Speak & Learn etc.)
  // distilled into craft contracts: measured motion timings, canvas,
  // reduced-motion, interaction gating, semantic actions, branding rules.
  "welcome-screens": welcomeScreensAudit,
  "ui-ux-core": stripFrontmatter(uiUxCoreAudit),
  "motion-interaction": stripFrontmatter(motionInteractionSkill),
  // The ui-ux-mastery accessibility reference is the focused audit contract
  // for this pass; the full 2.3k-line skill stays in main-prompt context.
  accessibility: stripFrontmatter(accessibilityAudit),
  "platform-patterns": stripFrontmatter(platformPatternsAudit),
  "backend-production": stripFrontmatter(backendProductionSkill),
  "anti-ai-slop": stripFrontmatter(antiSlopAudit),
};

export interface CheckpointChainConfig {
  /** Brand-new app — includes the product-flow pass. */
  isNewApp: boolean;
  /** This turn touched onboarding/welcome screen files. */
  hasOnboardingScreens: boolean;
  /** This turn touched backend/server/supabase-function code. */
  hasBackendCode: boolean;
  /** Free-tier budget: fewer total passes (core suite stays intact). */
  freeModelMode: boolean;
  /** Web apps get a shorter chain (no onboarding pass). */
  isWebApp: boolean;
  /**
   * App framework. When "flutter", every pass re-targets to judging Dart
   * widget trees (Material 3, tokens, motion, a11y) instead of CSS/web.
   */
  frameworkType?: AppFrameworkType | null;
}

/** Full chain: conditional skills lead, always-on core follows. */
export const DEFAULT_CHAIN_PASSES = 9;
/** Free-model chain: the always-on core, no conditional skills. */
export const FREE_MODEL_CHAIN_PASSES = 5;

/** Deterministic ordered chain — never keyword-gated by the user's request. */
export function buildCheckpointChain(
  config: CheckpointChainConfig,
): CheckpointPass[] {
  const maxPasses = config.freeModelMode
    ? FREE_MODEL_CHAIN_PASSES
    : DEFAULT_CHAIN_PASSES;
  const bodies: Record<CheckpointPassId, string> =
    config.frameworkType === "flutter" ? FLUTTER_PASS_BODIES : PASS_BODIES;

  // Free tier runs only the always-on core (5 passes) — conditional skills
  // are extra coverage, not core. This guarantees the core suite
  // (ui-ux-core, motion, accessibility, platform-patterns, anti-ai-slop) is
  // never trimmed by the pass cap.
  const conditionalPassIds: CheckpointPassId[] = [];
  if (config.isNewApp) {
    conditionalPassIds.push("product-flow");
  }
  // New apps get a welcome/splash screen by default; existing apps get the
  // pass when onboarding/welcome paths are touched. Web apps have no native
  // splash-welcome layer, so the pass is mobile-only.
  if (!config.isWebApp && (config.isNewApp || config.hasOnboardingScreens)) {
    conditionalPassIds.push("welcome-screens");
  }
  if (!config.isWebApp && config.hasOnboardingScreens) {
    conditionalPassIds.push("onboarding-welcome");
  }
  if (config.hasBackendCode) {
    conditionalPassIds.push("backend-production");
  }

  const corePassIds: CheckpointPassId[] = [
    "ui-ux-core",
    "motion-interaction",
    "accessibility",
    "platform-patterns",
    "anti-ai-slop",
  ];

  // Conditional skills lead, then the always-on core. Cap from the FRONT so
  // the core tail (anti-ai-slop last) is never trimmed.
  const passIds = config.freeModelMode
    ? corePassIds
    : [...conditionalPassIds, ...corePassIds];
  const trimmed = passIds.slice(Math.max(0, passIds.length - maxPasses));
  return trimmed.map((id) => ({ id, body: bodies[id] }));
}

export interface CheckpointChain {
  /** Passes not yet scheduled or waiting on a retry. */
  pending: CheckpointPass[];
  /** The pass currently scheduled (null when starting a fresh pass). */
  inFlight: CheckpointPass | null;
  /** Retries already used for the in-flight pass. */
  retriesUsed: number;
}

export function createChain(config: CheckpointChainConfig): CheckpointChain {
  return {
    pending: buildCheckpointChain(config),
    inFlight: null,
    retriesUsed: 0,
  };
}

/** Action the harness should take for the next loop iteration. */
export type ChainStep = "done" | "retry" | "next";

/**
 * Advance the state machine with the outcome of the iteration that just ran.
 * `madeEdits` is whether the previous scheduled pass changed any files. A
 * zero-change pass is retried exactly once, then we move on.
 */
export function advanceChain(
  chain: CheckpointChain,
  madeEdits: boolean,
): { step: ChainStep; pass: CheckpointPass | null } {
  if (chain.inFlight && !madeEdits && chain.retriesUsed < 1) {
    chain.retriesUsed += 1;
    return { step: "retry", pass: chain.inFlight };
  }
  chain.inFlight = null;
  chain.retriesUsed = 0;
  const next = chain.pending.shift() ?? null;
  chain.inFlight = next;
  return { step: next ? "next" : "done", pass: next };
}

export function buildPassPrompt(
  pass: CheckpointPass,
  opts?: { retry?: boolean; target?: "app" | "plan" },
): string {
  const { retry, target = "app" } = opts ?? {};
  const retryNote = retry
    ? `\n\n[System] The previous attempt at this pass made no changes. ` +
      `Re-inspect; if the contract is already satisfied, reply concisely ` +
      `that this pass is complete.`
    : "";
  const targetNote =
    target === "plan"
      ? `Inspect the implementation plan (not built code). If the plan ` +
        `violates the contract below, revise the plan in writing and note ` +
        `the change in your reply. Do not invent file edits.`
      : `Inspect the current app state and apply the skill contract below. ` +
        `Change only what actually violates the contract for this pass; do ` +
        `not redesign unrelated screens. If the contract is already ` +
        `satisfied, reply concisely that no changes were needed.`;
  return (
    `[System] Checkpoint pass: ${pass.id}.\n\n` +
    targetNote +
    `\n\n<checkpoint-skill name="${pass.id}">\n${pass.body}\n</checkpoint-skill>` +
    retryNote
  );
}

const ONBOARDING_SCREEN_PATTERN =
  /welcome|onboard|get-?started|getting-?started|intro|landing|first-?time|first-?run/i;

/** Whether a file path strongly suggests an onboarding/welcome screen. */
export function isOnboardingScreenPath(filePath: string): boolean {
  return ONBOARDING_SCREEN_PATTERN.test(filePath);
}

const BACKEND_CODE_PATTERN =
  /(^|\/)(supabase\/functions|backend|server|api|functions|routes|middleware|handlers|controllers|services)(\/|\.|$)/i;

/** Whether a file path strongly suggests backend/server/supabase code. */
export function isBackendCodePath(filePath: string): boolean {
  return BACKEND_CODE_PATTERN.test(filePath);
}

export function hasStartedChain(chain: CheckpointChain): boolean {
  return chain.inFlight !== null || chain.pending.length > 0;
}
