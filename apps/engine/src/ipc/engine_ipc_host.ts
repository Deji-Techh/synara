// FILE: src/ipc/engine_ipc_host.ts
// Purpose: Engine-side IPC registration (the product subset of dyad's
// ipc_host.ts). Registers the handler groups the Caide engine exposes
// over its JSON-RPC bridge, including the Neon and Supabase database
// integrations. Other stripped domains (vercel/collab/blockchain/portal/
// figma/share/chatgpt/capacitor/window/upload/... and their renderer-only
// companions) remain intentionally absent.
//
// Registration must happen once before the engine accepts `dyad.invoke`
// requests.

import { registerAppHandlers } from "./handlers/app_handlers";
import { registerImportHandlers } from "./handlers/import_handlers";
import { registerChatHandlers } from "./handlers/chat_handlers";
import { registerChatStreamHandlers } from "./handlers/chat_stream_handlers";
import { registerSettingsHandlers } from "./handlers/settings_handlers";
import { registerShellHandlers } from "./handlers/shell_handler";
import { registerDependencyHandlers } from "./handlers/dependency_handlers";
import { registerCustomAppsFolderHandlers } from "./handlers/custom_apps_folder_handlers";
import { registerGithubHandlers } from "./handlers/github_handlers";
import { registerGithubBranchHandlers } from "./handlers/git_branch_handlers";
import { registerLocalModelHandlers } from "./handlers/local_model_handlers";
import { registerTokenCountHandlers } from "./handlers/token_count_handlers";
import { registerLanguageModelHandlers } from "./handlers/language_model_handlers";
import { registerProblemsHandlers } from "./handlers/problems_handlers";
import { registerAppEnvVarsHandlers } from "./handlers/app_env_vars_handlers";
import { registerTemplateHandlers } from "./handlers/template_handlers";
import { registerThemesHandlers } from "../pro/main/ipc/handlers/themes_handlers";
import { registerPromptHandlers } from "./handlers/prompt_handlers";
import { registerHelpBotHandlers } from "./handlers/help_bot_handlers";
import { registerMcpHandlers } from "./handlers/mcp_handlers";
import { registerSecurityHandlers } from "./handlers/security_handlers";
import { registerAgentToolHandlers } from "../pro/main/ipc/handlers/local_agent/agent_tool_handlers";
import { registerFreeAgentQuotaHandlers } from "./handlers/free_agent_quota_handlers";
import { registerFreeModelQuotaHandlers } from "./handlers/free_model_quota_handlers";
import { registerPlanHandlers } from "./handlers/plan_handlers";
import { registerAppBlueprintHandlers } from "./handlers/app_blueprint_handlers";
import { registerSidebarHandlers } from "./handlers/sidebar_handlers";
import { registerAppCollectionHandlers } from "./handlers/app_collection_handlers";
import { registerGoalHandlers } from "./handlers/goal_handlers";
import { registerReferenceHandlers } from "./handlers/reference_handlers";
import { registerNeonHandlers } from "./handlers/neon_handlers";
import { registerSupabaseHandlers } from "./handlers/supabase_handlers";

let registered = false;

export function registerEngineIpcHandlers(): void {
  if (registered) {
    return;
  }
  registered = true;

  // App lifecycle — names, creation (flutter template), git, identities
  registerAppHandlers();
  registerImportHandlers();
  registerChatHandlers();
  registerChatStreamHandlers();
  registerSettingsHandlers();
  registerShellHandlers();
  registerDependencyHandlers();
  registerCustomAppsFolderHandlers();
  registerGithubHandlers();
  registerGithubBranchHandlers();

  // Model + token plumbing
  registerLocalModelHandlers();
  registerTokenCountHandlers();
  registerLanguageModelHandlers();

  // Project/workspace tooling
  registerProblemsHandlers();
  registerAppEnvVarsHandlers();
  registerTemplateHandlers();
  registerThemesHandlers();
  registerPromptHandlers();
  registerHelpBotHandlers();
  registerMcpHandlers();
  registerSecurityHandlers();
  registerFreeAgentQuotaHandlers();
  registerFreeModelQuotaHandlers();
  registerPlanHandlers();
  registerAppBlueprintHandlers();
  registerSidebarHandlers();
  registerAppCollectionHandlers();

  // Agent surface: goals + references + the local agent tool registry
  registerGoalHandlers();
  registerReferenceHandlers();
  // Database integrations — Neon + Supabase management, SQL, branches, auth
  registerNeonHandlers();
  registerSupabaseHandlers();
  registerAgentToolHandlers();
}
