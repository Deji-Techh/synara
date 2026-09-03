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
  DbNotConnectedError,
  type DbDriver,
  type ResolvedDatabase,
  type SqlConsentInfo,
  type IntegrationTransport,
} from "./dbTools.ts";
export { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";
export {
  linkDatabase,
  unlinkDatabase,
  getDatabaseLink,
  resolveDatabaseUrl,
  type DbLink,
  type DbProvider,
} from "./connections.ts";
