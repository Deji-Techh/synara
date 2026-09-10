// FILE: skillPacks.ts
// Purpose: Assemble CAIDE_MOBILE_UI_SKILL_PACK / WEB3_SKILL_PACK from .md
// skill files on disk (fs-loaded; see skillLoader.ts).
// Donor: dyad x caide src/prompts/mobile_ui_skill_pack.ts (assembly shape
// verbatim) + web3_skill_pack.ts (9 web3 modules + multi-chain rules).
// WEB pack string lives in webSkillPack.ts; selected via buildUiSkillPack().

import { DESIGN_ENGINE_CONTRACT, DESIGN_REFERENCE_INDEX_PROMPT } from "./designEngine.ts";
import {
  parseFrontmatter,
  stripFrontmatter,
  type SkillFrontmatter,
} from "./skillFrontmatter.ts";
import { readSkill, readWeb3Skill } from "./skillLoader.ts";
import { CAIDE_WEB_UI_SKILL_PACK } from "./webSkillPack.ts";
import type { AppTarget } from "./appTarget.ts";
import type { CaideFramework } from "./framework.ts";

export { CAIDE_WEB_UI_SKILL_PACK };

const uiUxMasterySkill = readSkill("ui-ux-mastery/SKILL.md");
const productArchetypes = readSkill("ui-ux-mastery/references/product-archetypes.md");
const designSystem = readSkill("ui-ux-mastery/references/design-system.md");
const componentContracts = readSkill(
  "ui-ux-mastery/references/component-contracts.md",
);
const accessibility = readSkill("ui-ux-mastery/references/accessibility.md");
const antiSlop = readSkill("ui-ux-mastery/references/anti-slop.md");
const designToCode = readSkill("ui-ux-mastery/references/design-to-code.md");
const platformPatterns = readSkill(
  "ui-ux-mastery/references/platform-patterns.md",
);
const qualityRubric = readSkill("ui-ux-mastery/references/quality-rubric.md");
const motionDirection = readSkill(
  "ui-ux-mastery/references/motion-direction.md",
);
const screenSpec = readSkill("ui-ux-mastery/templates/screen-spec.md");
const componentContract = readSkill(
  "ui-ux-mastery/templates/component-contract.md",
);
const designAudit = readSkill("ui-ux-mastery/templates/design-audit.md");
const designSpec = readSkill("ui-ux-mastery/templates/design-spec.md");
const motionStoryboard = readSkill(
  "ui-ux-mastery/templates/motion-storyboard.md",
);
const motionInteractionSkill = readSkill("motion-interaction/SKILL.md");
const productFlowSkill = readSkill("product-flow/SKILL.md");
const backendProductionSkill = readSkill("backend-production/SKILL.md");
const antiAiSlopSkill = readSkill("anti-ai-slop/SKILL.md");
// Appllama transplant: skill files ship verbatim under skills/appllama-design
// and skills/appllama-research (MIT, author attributed in frontmatter). Only
// the frontmatter is parsed here; bodies stay on disk for fork-skill depth.
const appllamaDesignSkill = readSkill("appllama-design/SKILL.md");
const appllamaResearchSkill = readSkill("appllama-research/SKILL.md");
const appllamaWebRuntime = readSkill("appllama-design/caide-runtime-web.md");
// P4: mobile + flutter runtimes are inlined per framework (same as web) so
// the model gets the exact stack mapping instead of an unreadable file path.
const appllamaMobileRuntime = readSkill("appllama-design/caide-runtime-mobile.md");
const appllamaFlutterRuntime = readSkill("appllama-design/caide-runtime-flutter.md");

export const UIUX_SKILL_FRONTMATTER: SkillFrontmatter =
  parseFrontmatter(uiUxMasterySkill).frontmatter;

export const COMPANION_SKILL_FRONTMATTERS: Record<string, SkillFrontmatter> = {
  "motion-interaction": parseFrontmatter(motionInteractionSkill).frontmatter,
  "product-flow": parseFrontmatter(productFlowSkill).frontmatter,
  "backend-production": parseFrontmatter(backendProductionSkill).frontmatter,
  "anti-ai-slop": parseFrontmatter(antiAiSlopSkill).frontmatter,
  "onboarding-welcome": parseFrontmatter(readSkill("onboarding-welcome/SKILL.md"))
    .frontmatter,
  "appllama-design": {
    ...parseFrontmatter(appllamaDesignSkill).frontmatter,
    // Donor blurb names a concrete stack ("Expo / React Native"); this
    // registry advertises into every target's prompt including website, so
    // keep the one-liner stack-neutral. Verbatim text stays on disk.
    description:
      "Benchmark-quality mobile UI laws: native fidelity, navigation grammar, anti-slop discipline, motion gates, and verification loops. Use when designing or polishing any mobile UI — screens, flows, onboarding, paywalls, sheets, settings — or when studying top-app patterns. Pairs with the Appllama MCP; stack detail resolves per framework.",
  },
  "appllama-research": parseFrontmatter(appllamaResearchSkill).frontmatter,
};

const skillBody = stripFrontmatter(uiUxMasterySkill);
// Always-on Appllama benchmark laws. Framework-neutral by design: this pack
// is shared by React Native and Flutter, so stack-specific detail (package
// names, router APIs, preview commands) lives in the runtime files on disk,
// selected by <caide_framework>. Full skill texts are fork-skill depth.
const APPLLAMA_MOBILE_LAWS = `
<appllama-mobile-laws>
Benchmark bar (Appllama transplant — every mobile screen must clear this):
- Study before drawing: when the task names a screen type (onboarding, paywall, settings, empty state), study real top-app patterns first via the appllama-research companion skill (needs the Appllama MCP; if unconnected, reason from the playbooks on disk). Extract the pattern, not the pixels.
- Native fidelity: semantic colors in light AND dark from day one; native controls over rebuilt ones; generous touch targets; one accent color, one grey family, locked corner radii; real text over decorative iconography.
- Navigation grammar: push for forward exploration, replace for one-way doors (sign-in wall, onboarding done, purchase) so back can never re-enter the old state. Sheets, dialogs, and overlays each have one job — never navigate with a sheet.
- Motion gate: platform-default motion for tabs, scroll, and back; near-imperceptible press feedback; standard motion for dialogs and toasts; delight only on rare first-time moments. Honor reduce-motion. Never claim smooth frame rates without on-device measurement.
- Definition of done: screenshot the preview and scrub every path — back, modals, keyboard both directions, rapid taps, long content, empty, loading, and error states, large text, landscape — and fix until no flaw remains.
- Enforce alongside the anti-ai-slop companion skill (universal restraint-and-process bar); both must pass. Where the two overlap, restraint wins over decoration.
- Product imagery: never ship flat-color blocks with initials as product photos. Use generated imagery (generate_image, then copy_file into the public directory) or the skill's image-asset patterns; placeholders only when the user provided no asset, recorded as such.
Stack detail: the runtime appendix matching this project's Caide framework is inlined directly below — follow its stack mapping exactly, do not re-derive replacements.
Full laws and references: skills/appllama-design/SKILL.md plus skills/appllama-design/references/. Research playbooks: skills/appllama-research/ (fork via execute_fork_skill as appllama-design / appllama-research).
</appllama-mobile-laws>
`.trim();

// Web runtime: the Appllama laws were written for native mobile. Applied
// literally to a website they produce a narrow phone column floating in a
// desktop viewport, so the appendix below reads as OVERRIDES for web targets.
const APPLLAMA_WEB_BLOCK = `
<appllama-web-runtime>
The following Caide runtime appendix translates the Appllama benchmark laws to responsive web. Where it conflicts with mobile skill text, it wins for website targets.

${appllamaWebRuntime.trim()}
</appllama-web-runtime>
`.trim();
const companionSkills = [
  { name: "Motion and Interaction", content: motionInteractionSkill },
  { name: "Product Flow", content: productFlowSkill },
  { name: "Backend Production", content: backendProductionSkill },
  { name: "Anti AI Slop", content: antiAiSlopSkill },
]
  .map(
    (skill) =>
      `<companion-skill name="${skill.name}">\n${stripFrontmatter(skill.content)}\n</companion-skill>`,
  )
  .join("\n\n");

const references = [
  { name: "Product Archetypes", content: productArchetypes },
  { name: "Design System", content: designSystem },
  { name: "Component Contracts", content: componentContracts },
  { name: "Accessibility", content: accessibility },
  { name: "Anti-Slop and Distinctiveness", content: antiSlop },
  { name: "Design to Code", content: designToCode },
  { name: "Platform Patterns", content: platformPatterns },
  { name: "Quality Rubric", content: qualityRubric },
  { name: "Motion Direction and Capability Routing", content: motionDirection },
];

const templates = [
  { name: "Screen Spec", content: screenSpec },
  { name: "Component Contract", content: componentContract },
  { name: "Design Audit", content: designAudit },
  { name: "Persistent Design Spec", content: designSpec },
  { name: "Persistent Motion Storyboard", content: motionStoryboard },
];

const referencesBlock = references
  .map((r) => `<reference name="${r.name}">\n${r.content.trim()}\n</reference>`)
  .join("\n\n");

const templatesBlock = templates
  .map((t) => `<template name="${t.name}">\n${t.content.trim()}\n</template>`)
  .join("\n\n");

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

${APPLLAMA_MOBILE_LAWS}
</mandatory-ui-ux-skill>

<ui-ux-references>
The following reference documents provide detailed guidance for specific UX domains. Consult them when relevant to the task.

${referencesBlock}
</ui-ux-references>

<ui-ux-templates>
The following templates can be used to structure design work for screens, components, and audits.

${templatesBlock}
</ui-ux-templates>
`.trim();

/** Select the UI skill pack for a build target (defaults to mobile). The
 * matching Appllama runtime appendix is inlined for the Caide framework so
 * the model never has to resolve a server-side skill path from the app
 * workspace (P4). Blank targets carry the mobile runtime (phone-first). */
export function buildUiSkillPack(appTarget?: AppTarget, caideFramework?: CaideFramework): string {
  if (appTarget === "web") {
    return `${CAIDE_WEB_UI_SKILL_PACK}\n\n${APPLLAMA_WEB_BLOCK}`;
  }
  const runtime =
    caideFramework === "flutter" ? appllamaFlutterRuntime.trim() : appllamaMobileRuntime.trim();
  const label = caideFramework === "flutter" ? "flutter" : "react-native";
  return `${CAIDE_MOBILE_UI_SKILL_PACK}\n\n<appllama-framework-runtime target="${label}">\n${runtime}\n</appllama-framework-runtime>`;
}

const WEB3_MODULE_FILES = [
  { name: "Solana Development", file: "web3-solana/SKILL.md" },
  { name: "EVM Development", file: "web3-evm/SKILL.md" },
  { name: "Multi-Chain Wallet", file: "web3-wallet/SKILL.md" },
  { name: "Multi-Chain Architecture", file: "web3-multichain/SKILL.md" },
  { name: "DeFi Protocols", file: "web3-defi/SKILL.md" },
  { name: "NFTs & Digital Assets", file: "web3-nft/SKILL.md" },
  { name: "Tokenomics & Launch", file: "web3-tokenomics/SKILL.md" },
  { name: "Cross-Chain", file: "web3-crosschain/SKILL.md" },
  { name: "Security", file: "web3-security/SKILL.md" },
] as const;

export const WEB3_SKILL_FRONTMATTERS: Record<string, SkillFrontmatter> =
  Object.fromEntries(
    WEB3_MODULE_FILES.map((m) => [
      m.file.split("/")[0],
      parseFrontmatter(readWeb3Skill(m.file)).frontmatter,
    ]),
  );

const web3ModulesBlock = WEB3_MODULE_FILES.map((m) => {
  const content = readWeb3Skill(m.file);
  return `<web3-module name="${m.name}">\n${stripFrontmatter(content)}\n</web3-module>`;
}).join("\n\n");

export const WEB3_SKILL_PACK = `
<web3-development>
The following web3 development modules are enabled for this multi-chain dApp. Follow them as authoritative reference when building blockchain features.

${web3ModulesBlock}

## General Multi-Chain Rules
- Always handle wallet disconnection gracefully
- Show loading states during blockchain operations
- Validate addresses before sending transactions
- Use try/catch around all blockchain RPC calls
- Never expose private keys, seed phrases, or API keys
- Prefer the pre-built components in src/caide-web3/ when adding wallet connection features

## Web3 Delivery Flow
- Clarify chain, wallet scope, and transaction surfaces with planning_questionnaire before building — never assume mainnet, a specific wallet, or real funds.
- Verify with test_rpc and read-only calls on devnet/testnet first; only touch mainnet on explicit user confirmation.
- Run verify_design for any wallet/transaction UI and capture evidence of connect → sign → confirm flows.
</web3-development>
`.trim();
