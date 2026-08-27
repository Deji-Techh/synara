import { rawAsset } from "@/raw-assets";
import { UI_LIBRARY } from "@/pro/main/ipc/handlers/local_agent/tools/read_ui_reference";
const uiUxMasterySkill = rawAsset("src/prompts/skills/ui-ux-mastery/SKILL.md");
const motionInteractionSkill = rawAsset("src/prompts/skills/motion-interaction/SKILL.md");
const productFlowSkill = rawAsset("src/prompts/skills/product-flow/SKILL.md");
const backendProductionSkill = rawAsset("src/prompts/skills/backend-production/SKILL.md");
const antiAiSlopSkill = rawAsset("src/prompts/skills/anti-ai-slop/SKILL.md");
const onboardingWelcomeSkill = rawAsset("src/prompts/skills/onboarding-welcome/SKILL.md");

import { DESIGN_REFERENCE_INDEX_PROMPT } from "./design_reference_index";
import { SKILL_INDEX_BLOCK } from "./skill_index";
import { stripFrontmatter, parseFrontmatter, type SkillFrontmatter } from "./skill_frontmatter";

export const UIUX_SKILL_FRONTMATTER = parseFrontmatter(uiUxMasterySkill).frontmatter;
export const COMPANION_SKILL_FRONTMATTERS: Record<string, SkillFrontmatter> = {
  "motion-interaction": parseFrontmatter(motionInteractionSkill).frontmatter,
  "product-flow": parseFrontmatter(productFlowSkill).frontmatter,
  "backend-production": parseFrontmatter(backendProductionSkill).frontmatter,
  "anti-ai-slop": parseFrontmatter(antiAiSlopSkill).frontmatter,
  "onboarding-welcome": parseFrontmatter(onboardingWelcomeSkill).frontmatter,
};

// Deep reference documents are NOT inlined here. They are served on demand via
// the `read_ui_reference` tool so every prompt does not carry ~110KB of
// always-on design prose. The pack ships only an index of what is available.
const referenceLibraryBlock = Object.entries(UI_LIBRARY)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, entry]) => `- ${name} (${entry.kind}): ${entry.description}`)
  .join("\n");

export const CAIDE_MOBILE_UI_SKILL_PACK = `
<mandatory-ui-ux-skill>
The following CAIDE skill is slim — heavy detail is on-demand via skills. Follow the preview contract and the skill index below.

## CAIDE preview contract (always)
- CAIDE already renders the app inside the selected phone, foldable, tablet, or responsive frame. Render only the application screen.
- Never create a fake device, phone bezel, browser toolbar, status-bar shell, or "Made with" badge inside the generated app.
- Never wrap the app root in a fixed phone-sized canvas such as 390x780. The document, body, #root, and top-level application shell must fill the available frame with width: 100%, min-width: 0, and min-height: 100dvh where appropriate.
- Remove starter-template constraints such as #root max-width with margin: 0 auto and body-level flex/place-items centering.
- For responsive: phone 320x568 / 390x844, landscape 844x390, tablet 768x1024 / 1024x768 — verify intentional use of width/height, no horizontal scroll, no clipped actions. For single-screen utilities (calculator etc.), a simple centered layout is acceptable — do not over-engineer tablet adaptation.

## Design-engine pointer (conditional)
- For multi-screen apps or major redesigns: read the design-engine skill (read_ui_reference name="design-audit") and follow its 6-stage workflow (brief → pattern refs → persistent specs → motion routing → system impl → single final review).
- For single-screen utilities, bug fixes, or narrow edits: SKIP persistent design-spec/motion-spec creation. Build minimal, focused UI and run ONE final review at the end.
- Motion: use native CSS / Web Animations for press/fade; install motion libs only when needed. One final review pass, not per-file.

${DESIGN_REFERENCE_INDEX_PROMPT}

${SKILL_INDEX_BLOCK}
</mandatory-ui-ux-skill>

<ui-ux-reference-library>
The following detailed CAIDE design documents exist but are NOT included in this prompt. Read them on demand with the read_ui_reference tool (name parameter) before substantial UI work or when auditing design quality:

${referenceLibraryBlock}
</ui-ux-reference-library>
`.trim();
