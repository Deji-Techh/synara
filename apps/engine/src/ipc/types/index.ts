/**
 * Type-Safe IPC Layer
 *
 * This module provides a unified, type-safe interface for all IPC operations.
 * Contracts define the single source of truth for channel names, input schemas,
 * and output schemas. Clients are auto-generated from contracts.
 *
 * @example
 * // Invoke-response pattern
 * const settings = await ipc.settings.getUserSettings();
 * const { app, chatId } = await ipc.app.createApp({ name: "my-app" });
 *
 * // Streaming pattern
 * ipc.chatStream.start(
 *   { chatId: 123, prompt: "Hello" },
 *   { onChunk, onEnd, onError }
 * );
 *
 * // Event subscription pattern
 * const unsubscribe = ipc.events.agent.onTodosUpdate((payload) => {
 *   updateTodoList(payload.todos);
 * });
 */

// =============================================================================
// Contract Exports
// =============================================================================

export { settingsContracts } from "./settings";
export { appContracts } from "./app";
export { chatContracts, chatStreamContract } from "./chat";
export { agentContracts, agentEvents } from "./agent";
export { githubContracts, gitContracts, githubEvents } from "./github";
export { mcpContracts, mcpEvents } from "./mcp";
export { systemContracts, systemEvents } from "./system";
export { languageModelContracts } from "./language-model";
export { promptContracts } from "./prompts";
export { templateContracts } from "./templates";
export { proposalContracts } from "./proposals";
export { helpContracts, helpStreamContract } from "./help";
export { capacitorContracts, capacitorEvents } from "./capacitor";
export { securityContracts } from "./security";
export { miscContracts, miscEvents } from "./misc";
export { freeAgentQuotaContracts } from "./free_agent_quota";
export { freeModelQuotaContracts } from "./free_model_quota";
export { imageGenerationContracts } from "./image_generation";
export { appBlueprintContracts, appBlueprintEvents } from "./app_blueprint";
export { appCollectionContracts } from "./app_collections";
export { referenceContracts, referenceClient } from "./reference";
export { testsContracts, testsEvents } from "./tests";
export { goalContracts, goalEvents } from "./goal";
export { settingsClient } from "./settings";
export { appClient } from "./app";
export { chatClient, chatStreamClient } from "./chat";
export { agentClient, agentEventClient } from "./agent";
export { githubClient, gitClient, githubEventClient } from "./github";
export { mcpClient, mcpEventClient } from "./mcp";
export { systemClient, systemEventClient } from "./system";
export { languageModelClient } from "./language-model";
export { promptClient } from "./prompts";
export { templateClient } from "./templates";
export { proposalClient } from "./proposals";
export { helpClient, helpStreamClient } from "./help";
export { capacitorClient, capacitorEventClient } from "./capacitor";
export { securityClient } from "./security";
export { miscClient, miscEventClient } from "./misc";
export { freeAgentQuotaClient } from "./free_agent_quota";
export { freeModelQuotaClient } from "./free_model_quota";
export { imageGenerationClient } from "./image_generation";
export { appBlueprintClient, appBlueprintEventClient } from "./app_blueprint";
export { appCollectionClient } from "./app_collections";
export { testsClient, testsEventClient } from "./tests";
export { goalClient, goalEventClient } from "./goal";
export type {
  GetUserSettingsInput,
  GetUserSettingsOutput,
  ProviderApiKeyValidationProvider,
  SetUserSettingsInput,
  SetUserSettingsOutput,
  ValidateProviderApiKeyInput,
  ValidateProviderApiKeyOutput,
} from "./settings";

// App types
export type {
  App,
  CreateAppParams,
  CreateAppResult,
  CopyAppParams,
  EditAppFileReturnType,
  RespondToAppInputParams,
  AppFileSearchResult,
  ChangeAppLocationParams,
  ChangeAppLocationResult,
  ListAppsResponse,
  RenameBranchParams,
  UpdateAppCommandsParams,
} from "./app";

// Chat types
export type {
  Message,
  Chat,
  ComponentSelection,
  FileAttachment,
  ChatAttachment,
  ChatStreamParams,
  ChatResponseChunk,
  ChatResponseEnd,
  UpdateChatParams,
  TokenCountParams,
  TokenCountResult,
  StreamingPatch,
} from "./chat";



export type {
  AgentTool,
  AgentTodo,
  AgentToolConsentRequestPayload,
  AgentToolConsentDecision,
  AgentToolConsentResponseParams,
  PromptEnvVarResponseParams,
  AgentTodosUpdatePayload,
  AgentProblemsUpdatePayload,
  SetAgentToolConsentParams,
  Problem,
  ProblemReport,
} from "./agent";

// GitHub types
export type {
  GitBranchAppIdParams,
  GitBranchParams,
  CreateGitBranchParams,
  RenameGitBranchParams,
  ListRemoteGitBranchesParams,
  CommitChangesParams,
  UncommittedFile,
  UncommittedFileStatus,
  GithubSyncOptions,
  CloneRepoParams,
  GithubRepository,
} from "./github";

// MCP types
export type {
  McpServer,
  McpTransport,
  CreateMcpServer,
  McpServerUpdate,
  McpTool,
  McpListToolsResult,
  McpToolConsent,
  McpConsentValue,
  McpConsentDecision,
  SetMcpToolConsentParams,
  McpConsentRequestPayload,
  McpConsentResponseParams,
} from "./mcp";

// Vercel types
export type {
  NodeSystemInfo,
  ManagedNodeInstallProgress,
  SystemDebugInfo,
  SelectNodeFolderResult,
  DoesReleaseNoteExistParams,
  UserBudgetInfo,
  TelemetryEventPayload,
} from "./system";

// Version types
export type {
  LanguageModelProvider,
  LanguageModel,
  LocalModel,
  CreateCustomLanguageModelProviderParams,
  CreateCustomLanguageModelParams,
} from "./language-model";

export type {
  PromptDto,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
} from "./prompts";

// Template types
export type {
  Template,
  Theme,
  SetAppThemeParams,
  GetAppThemeParams,
  CustomTheme,
  CreateCustomThemeParams,
  UpdateCustomThemeParams,
  DeleteCustomThemeParams,
  ThemeGenerationMode,
  ThemeGenerationModel,
  ThemeGenerationModelOption,
  ThemeInputSource,
  CrawlStatus,
  GenerateThemePromptParams,
  GenerateThemePromptResult,
  GenerateThemeFromUrlParams,
  SaveThemeImageParams,
  SaveThemeImageResult,
  CleanupThemeImagesParams,
} from "./templates";

// Proposal types
export type { ProposalResult, ApproveProposalResult } from "./proposals";

// Import types
export type { HelpChatStartParams } from "./help";

// Context types
export type { SecurityReviewResult } from "./security";

// Misc types
export type {
  SessionDebugBundle,
  DeepLinkData,
  AppOutput,
  AppEnvVar,
  EnvVar,
} from "./misc";

// Free agent quota types
export type { FreeAgentQuotaStatus } from "./free_agent_quota";
export type { FreeModelQuotaStatus } from "./free_model_quota";

// Pro types
export type { TranscribeAudioParams, TranscribeAudioResult } from "./audio";

// Media types
export type {
  ImageThemeMode,
  GenerateImageParams,
  GenerateImageResponse,
} from "./image_generation";

// Tests types
export type {
  TestSpec,
  TestCase,
  TestRunStatus,
  TestResult,
  TestCaseResult,
  RunAppTestsResult,
  TestIsolation,
  TestOutputPayload,
} from "./tests";

// App blueprint types
export type {
  AppBlueprintVisual,
  AppBlueprintData,
  AppBlueprintUpdatePayload,
  AppBlueprintVisualsUpdatePayload,
  AppBlueprintApprovePayload,
  AppBlueprintFieldEditPayload,
  AppBlueprintApprovedPayload,
} from "./app_blueprint";

export type {
  Goal,
  GoalStatus,
  GoalExecutionTarget,
  GoalTask,
  GoalTaskStatus,
  GoalEvidence,
  GoalRun,
  GoalRunKind,
  GoalRunStatus,
  GoalActivityEvent,
} from "./goal";

// Blockchain types
export {
  AppSchema,
  CreateAppParamsSchema,
  CreateAppResultSchema,
  AppFileSearchResultSchema,
} from "./app";

export {
  MessageSchema,
  ChatSchema,
  ChatAttachmentSchema,
  ChatStreamParamsSchema,
  ChatResponseEndSchema,
} from "./chat";

export {
  AgentTodoSchema,
  AgentTodosUpdateSchema,
  AgentToolSchema,
  AgentToolConsentRequestSchema,
  PromptEnvVarResponseParamsSchema,
} from "./agent";

export { UserBudgetInfoSchema } from "./system";

// =============================================================================
// Aggregated IPC Client
// =============================================================================

import { settingsClient } from "./settings";
import { appClient } from "./app";
import { chatClient, chatStreamClient } from "./chat";
import { agentClient, agentEventClient } from "./agent";
import { githubClient, gitClient, githubEventClient } from "./github";
import { mcpClient, mcpEventClient } from "./mcp";
import { systemClient, systemEventClient } from "./system";
import { sidebarClient } from "./sidebar";
import { languageModelClient } from "./language-model";
import { promptClient } from "./prompts";
import { templateClient } from "./templates";
import { proposalClient } from "./proposals";
import { helpClient, helpStreamClient } from "./help";
import { capacitorClient, capacitorEventClient } from "./capacitor";
import { securityClient } from "./security";
import { miscClient, miscEventClient } from "./misc";
import { freeAgentQuotaClient } from "./free_agent_quota";
import { freeModelQuotaClient } from "./free_model_quota";
import { imageGenerationClient } from "./image_generation";
import { appBlueprintClient, appBlueprintEventClient } from "./app_blueprint";
import { appCollectionClient } from "./app_collections";
import { testsClient, testsEventClient } from "./tests";
import { goalClient, goalEventClient } from "./goal";
import { referenceClient } from "./reference";
/**
 * Unified IPC client with all domains organized by namespace.
 *
 * @example
 * // Settings
 * const settings = await ipc.settings.getUserSettings();
 *
 * // App management
 * const app = await ipc.app.getApp(appId);
 *
 * // Chat operations
 * const chat = await ipc.chat.getChat(chatId);
 *
 * // Streaming
 * ipc.chatStream.start(params, callbacks);
 *
 * // Event subscriptions
 * ipc.events.agent.onTodosUpdate(handler);
 */
export const ipc = {
  // Core domains
  settings: settingsClient,
  app: appClient,
  chat: chatClient,
  agent: agentClient,

  // Streaming clients
  chatStream: chatStreamClient,
  helpStream: helpStreamClient,

  // Integrations
  github: githubClient,
  git: gitClient,
  mcp: mcpClient,

  // Features
  system: systemClient,
  languageModel: languageModelClient,
  prompt: promptClient,
  template: templateClient,
  proposal: proposalClient,
  help: helpClient,
  capacitor: capacitorClient,
  security: securityClient,
  misc: miscClient,
  freeAgentQuota: freeAgentQuotaClient,
  freeModelQuota: freeModelQuotaClient,
  imageGeneration: imageGenerationClient,
  appBlueprint: appBlueprintClient,
  appCollection: appCollectionClient,
  tests: testsClient,
  goal: goalClient,
  reference: referenceClient,
  sidebar: sidebarClient,

  // Event clients for main->renderer pub/sub
  events: {
    agent: agentEventClient,
    github: githubEventClient,
    mcp: mcpEventClient,
    system: systemEventClient,
    misc: miscEventClient,
    appBlueprint: appBlueprintEventClient,
    tests: testsEventClient,
    capacitor: capacitorEventClient,
    goal: goalEventClient,
  },
};

export * from "./sidebar";

export type { ConsoleEntry, ConsoleEntrySchema } from "./supabase";