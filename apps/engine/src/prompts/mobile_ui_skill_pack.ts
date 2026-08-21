import { rawAsset } from "@/raw-assets";
import { UI_LIBRARY } from "@/pro/main/ipc/handlers/local_agent/tools/read_ui_reference";
const uiUxMasterySkill = rawAsset("src/prompts/skills/ui-ux-mastery/SKILL.md");
const motionInteractionSkill = rawAsset("src/prompts/skills/motion-interaction/SKILL.md");
const productFlowSkill = rawAsset("src/prompts/skills/product-flow/SKILL.md");
const backendProductionSkill = rawAsset("src/prompts/skills/backend-production/SKILL.md");
const antiAiSlopSkill = rawAsset("src/prompts/skills/anti-ai-slop/SKILL.md");
const onboardingWelcomeSkill = rawAsset("src/prompts/skills/onboarding-welcome/SKILL.md");

import { DESIGN_ENGINE_CONTRACT } from "./design_engine_contract";
import { DESIGN_REFERENCE_INDEX_PROMPT } from "./design_reference_index";
import { stripFrontmatter, parseFrontmatter, type SkillFrontmatter } from "./skill_frontmatter";

export const UIUX_SKILL_FRONTMATTER = parseFrontmatter(uiUxMasterySkill).frontmatter;
export const COMPANION_SKILL_FRONTMATTERS: Record<string, SkillFrontmatter> = {
  "motion-interaction": parseFrontmatter(motionInteractionSkill).frontmatter,
  "product-flow": parseFrontmatter(productFlowSkill).frontmatter,
  "backend-production": parseFrontmatter(backendProductionSkill).frontmatter,
  "anti-ai-slop": parseFrontmatter(antiAiSlopSkill).frontmatter,
  "onboarding-welcome": parseFrontmatter(onboardingWelcomeSkill).frontmatter,
};

const skillBody = stripFrontmatter(uiUxMasterySkill);
const companionSkills = [
  { name: "Motion and Interaction", content: motionInteractionSkill },
  { name: "Product Flow", content: productFlowSkill },
  { name: "Backend Production", content: backendProductionSkill },
]
  .map(
    (skill) =>
      `<companion-skill name="${skill.name}">\n${stripFrontmatter(skill.content)}\n</companion-skill>`,
  )
  .join("\n\n");

// Deep reference documents are NOT inlined here. They are served on demand via
// the `read_ui_reference` tool so every prompt does not carry ~110KB of
// always-on design prose. The pack ships only an index of what is available.
const referenceLibraryBlock = Object.entries(UI_LIBRARY)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([name, entry]) =>
      `- ${name} (${entry.kind}): ${entry.description}`,
  )
  .join("\n");

export const CAIDE_MOBILE_UI_SKILL_PACK = `
<mandatory-ui-ux-skill>
The following CAIDE skill is permanently enabled for every application build and edit. Follow it as a completion contract, not optional inspiration.

## CAIDE preview contract
- CAIDE already renders the app inside the selected phone, foldable, tablet, or responsive frame. Render only the application screen.
- Never create a fake device, phone bezel, browser toolbar, status-bar shell, or "Made with" badge inside the generated app.
- Never wrap the app root in a fixed phone-sized canvas such as 390x780. The document, body, #root, and top-level application shell must fill the available frame with width: 100%, min-width: 0, and min-height: 100dvh where appropriate.
- Remove starter-template constraints such as #root max-width with margin: 0 auto and body-level flex/place-items centering. Apply max-width only to intentional inner content, never to the application viewport.
- Responsive does not mean stretching or centering the same narrow phone column. A full-height max-w-sm or max-w-md primary shell centered inside a tablet or landscape viewport is a failure, even when it does not overflow.
- Build deliberate adaptive compositions with CSS media/container queries or responsive utility variants: phone portrait may use one column; phone landscape must use the short height efficiently and recompose dense sections into columns or panes; tablet portrait and tablet landscape must widen content, navigation, grids, dialogs, and primary workflows instead of leaving large unused gutters.
- Verify every top-level screen and important state at 320x568 compact phone, 390x844 large phone, 844x390 phone landscape, 768x1024 tablet portrait, and 1024x768 tablet landscape. At each size, confirm intentional use of available width and height, no page-level horizontal scrolling, no clipped actions, no overlapping controls, no inaccessible content, and no narrow phone layout floating in empty tablet space.
- Do not finish a build or edit until responsive behavior is implemented in code for all five viewport classes. If browser automation is available, render and interact with each viewport; otherwise inspect every screen's layout classes and media/container rules explicitly.

${DESIGN_ENGINE_CONTRACT}

${DESIGN_REFERENCE_INDEX_PROMPT}

${skillBody}

${companionSkills}
</mandatory-ui-ux-skill>

<ui-ux-reference-library>
The following detailed CAIDE design documents exist but are NOT included in this prompt. Read them on demand with the read_ui_reference tool (name parameter) before substantial UI work or when auditing design quality:

${referenceLibraryBlock}
</ui-ux-reference-library>
`.trim();
