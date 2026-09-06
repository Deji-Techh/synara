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
export { DEFAULT_AI_RULES } from "./aiRules.ts";
export { COMPACTION_SYSTEM_PROMPT } from "./compactionPrompt.ts";
export { SUMMARIZE_CHAT_SYSTEM_PROMPT } from "./summarizeChatPrompt.ts";
export { SECURITY_REVIEW_SYSTEM_PROMPT } from "./securityReviewPrompt.ts";
export {
  NEON_NO_BROWSER_DATABASE_URL_RULE,
  NEON_NO_BROWSER_SERVERLESS_RULE,
  NEON_NO_CUSTOM_AUTH_RULE,
  NEON_NO_MANUAL_MIGRATIONS_RULE,
  NEON_RLS_REQUIRES_JWT_RULE,
  NEON_IMPLEMENTER_NO_MANUAL_MIGRATIONS_RULE,
  NEON_DISCONNECTED_SYSTEM_PROMPT,
  getNeonAvailableSystemPrompt,
} from "./neonPrompt.ts";
export {
  SUPABASE_NO_MANUAL_MIGRATIONS_RULE,
  SUPABASE_GRANTS_AND_RLS_RULE,
  SUPABASE_IMPLEMENTER_NO_MANUAL_MIGRATIONS_RULE,
  SUPABASE_IMPLEMENTER_RLS_RULE,
  SUPABASE_ROOT_RLS_RULE,
  SUPABASE_ROOT_NO_MANUAL_MIGRATIONS_RULE,
  SUPABASE_SERVICE_ROLE_BROWSER_RULE,
  SUPABASE_EDGE_FUNCTION_JWT_RULE,
  SUPABASE_DISCONNECTED_SYSTEM_PROMPT,
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT,
  getSupabaseAvailableSystemPrompt,
} from "./supabasePrompt.ts";
export {
  buildProviderInvariants,
  type ProviderInvariantOptions,
} from "./providerInvariants.ts";
export {
  TEST_ASSERTION_CODE_SYSTEM_PROMPT,
  buildAssertionCodePayload,
} from "./testAssertionsPrompt.ts";
export {
  INSPIRATION_PROMPTS,
  type InspirationIconName,
  type InspirationPrompt,
} from "./inspirationPrompts.ts";
export {
  GIT_CONTEXT_BLOCK,
  BUILD_GIT_CONTEXT_BLOCK,
  buildGitReminder,
  escapeXmlContent,
} from "./gitContextPrompt.ts";
export {
  APP_FRAMEWORK_TYPES,
  isNeonSupportedFramework,
  type AppFrameworkType,
} from "./frameworkType.ts";
export {
  TEST_WRITING_GUIDANCE,
  AGENT_TEST_WRITING_GUIDANCE,
} from "./testGuidance.ts";
export { PLAN_MODE_SYSTEM_PROMPT, constructPlanModePrompt } from "./planPrompt.ts";
export {
  CAIDE_FRAMEWORKS,
  CAIDE_FRAMEWORK_BRIEFS,
  buildFrameworkNotice,
  normalizeCaideFramework,
  defaultAiRulesForFramework,
  appTargetForFramework,
  applyFrameworkCommandTerms,
  applyFrameworkPathTerms,
  applyFrameworkBuildExamples,
  type CaideFramework,
} from "./framework.ts";
export {
  LOCAL_AGENT_ASK_SYSTEM_PROMPT,
  constructLocalAgentPrompt,
} from "./agentPrompt.ts";
export {
  THINKING_PROMPT,
  BUILD_SYSTEM_PREFIX,
  BUILD_SYSTEM_POSTFIX,
  constructSystemPrompt,
  getSystemPromptForChatMode,
  readAiRules,
} from "./systemPrompt.ts";
