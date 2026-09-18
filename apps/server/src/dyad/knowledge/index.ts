// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant knowledge system.

export {
  PROMPT_SLUG_PATTERN,
  PromptSchema,
  PromptLibraryError,
  listPrompts,
  listPromptsForApp,
  createPrompt,
  updatePrompt,
  deletePrompt,
  replacePromptReference,
  promptContentMap,
  type Prompt,
} from "./promptLibrary.ts";
export { helpAskTool, ALL_HELP_TOOLS } from "./helpBot.ts";
