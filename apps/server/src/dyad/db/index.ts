// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant database panel control.

export {
  DB_TOOL_NAMES,
  shouldRevealDatabasePanel,
  shouldRevealDatabasePanelForText,
  requestDatabasePanel,
  setDbPanelTransport,
  getDbPanelTransport,
  openDatabasePanelTool,
  ALL_DB_PANEL_TOOLS,
  type DbPanelTransport,
} from "./dbPanel.ts";
export {
  ALL_DB_TOOLS,
  executeSqlTool,
  getDatabaseTableSchemaTool,
  getSupabaseProjectInfoTool,
  getNeonProjectInfoTool,
  addIntegrationTool,
  enableNitroTool,
  executeSql,
  executeTableSchema,
  executeAddIntegration,
  executeEnableNitro,
  sqlConsentInfo,
  setDbDriver,
  setIntegrationTransport,
  DbToolError,
  type DbDriver,
  type ResolvedDatabase,
  type SqlConsentInfo,
  type IntegrationTransport,
} from "./dbTools.ts";
export { DbNotConnectedError } from "./connections.ts";
export { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";
export {
  ENV_FILE_NAME,
  REDACTED_ENV_VALUE,
  EnvFileError,
  isSensitiveEnvVarKey,
  redactAppEnvVars,
  resolveRedactedEnvVarUpdates,
  getEnvFilePath,
  writeEnvFileSecurely,
  parseEnvFile,
  serializeEnvFile,
  readEnvFile,
  readEnvFileIfExists,
  readEnvVarsOrEmpty,
  generateCookieSecret,
  updateNeonEnvVars,
  removeNeonEnvVars,
  updatePostgresUrlEnvVar,
  readPostgresUrlFromEnvFile,
  type EnvVar,
  type AppEnvVar,
} from "./envFile.ts";
export {
  NEON_API_BASE_URL,
  listNeonProjects,
  listNeonBranches,
  NeonApiError,
  type NeonProject,
  type NeonBranch,
} from "./neonApi.ts";
export {
  SUPABASE_API_BASE_URL,
  listSupabaseOrganizations,
  listSupabaseProjects,
  SupabaseApiError,
  type SupabaseOrganization,
  type SupabaseProject,
} from "./supabaseApi.ts";
export { slugifyMigrationName, writeMigrationFile } from "./migrations.ts";
export {
  SUPABASE_BUNDLE_ONLY_DEPLOY_CONCURRENCY,
  SUPABASE_ACTIVATING_DEPLOY_CONCURRENCY,
  enqueueSupabaseDeploy,
  resetSupabaseDeployQueuesForTests,
  mapSettledWithConcurrency,
  extractFunctionName,
  isServerFunction,
  isSharedServerModule,
  extractFunctionNameFromPath,
  getSupabaseFunctionsAffectedBySharedModules,
  deploySupabaseFunctions,
  deployAllSupabaseFunctions,
  deployAffectedSupabaseFunctions,
  type SupabaseDeployDeps,
  type SupabaseDeployedFunction,
  type SupabaseDeployProgress,
  type SupabaseDeployArgs,
  type SupabaseFunctionImpact,
} from "./supabaseDeploy.ts";
export {
  ensureDyadSchema,
  openDyadDb,
  defaultDyadDbPath,
  MCP_SERVERS_DDL,
  MCP_TOOL_CONSENTS_DDL,
} from "./schema.ts";
export {
  linkDatabase,
  unlinkDatabase,
  getDatabaseLink,
  resolveDatabaseUrl,
  type DbLink,
  type DbProvider,
} from "./connections.ts";
