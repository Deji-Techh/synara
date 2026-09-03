// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant prompt layer.
// Donor: dyad x caide src/prompts/* (adapted — no "@/..." alias, no "?raw").

export type { AppTarget } from "./appTarget.ts";
export { normalizeAppTarget } from "./appTarget.ts";
export {
  MOBILE_PRODUCT_CONTRACT,
  WEB_PRODUCT_CONTRACT,
  PLATFORM_SPEC_FILE,
  PLATFORM_SPEC_SYNC_RULE,
  buildPlatformPrompt,
} from "./platformContracts.ts";
export { CAIDE_WEB_UI_SKILL_PACK } from "./webSkillPack.ts";
export {
  DESIGN_ENGINE_CONTRACT,
  DESIGN_REFERENCE_INDEX_PROMPT,
} from "./designEngine.ts";
export {
  SkillFrontmatterSchema,
  parseFrontmatter,
  stripFrontmatter,
  type SkillFrontmatter,
  type ParsedSkill,
} from "./skillFrontmatter.ts";
export { readSkill, readWeb3Skill, readGuide } from "./skillLoader.ts";
export {
  CAIDE_MOBILE_UI_SKILL_PACK,
  WEB3_SKILL_PACK,
  WEB3_SKILL_FRONTMATTERS,
  UIUX_SKILL_FRONTMATTER,
  COMPANION_SKILL_FRONTMATTERS,
  buildUiSkillPack,
} from "./skillPacks.ts";
