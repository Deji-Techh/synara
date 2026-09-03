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
  linkDatabase,
  unlinkDatabase,
  getDatabaseLink,
  resolveDatabaseUrl,
  type DbLink,
  type DbProvider,
} from "./connections.ts";
