// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant planning loop.

export {
  waitForUserInput,
  resolveUserInput,
  dismissUserInput,
  clearUserInputForSession,
  nextRequestId,
  pendingCount,
  type PendingPrompt,
} from "./userPrompt.ts";
export {
  getTodos,
  setTodos,
  clearTodos,
  applyTodoUpdate,
  TodoValidationError,
  type Todo,
  type TodoStatus,
  type TodoUpdate,
} from "./todoStore.ts";
export {
  ALL_PLAN_TOOLS,
  planningQuestionnaireTool,
  writePlanTool,
  exitPlanTool,
  updateTodosTool,
  askEnvVarsTool,
  executeQuestionnaire,
  executeWritePlan,
  executeExitPlan,
  executeAskEnvVars,
  setPlanTransport,
  getPlanTransport,
  PlanUiNotConnectedError,
  PlanPreconditionError,
  type PlanTransport,
  type QuestionnaireItem,
  type EnvVarRequest,
} from "./planTools.ts";
export {
  ALL_BLUEPRINT_TOOLS,
  writeAppBlueprintTool,
  executeWriteAppBlueprint,
  setBlueprintTransport,
  getBlueprintTransport,
  BlueprintValidationError,
  type BlueprintTransport,
} from "./blueprintTools.ts";
export {
  setBlueprintRequired,
  isBlueprintRequired,
  presentBlueprint,
  approveBlueprint,
  getBlueprint,
  isBlueprintApproved,
  clearBlueprint,
  assertAppBlueprintApproved,
  BlueprintNotApprovedError,
  type AppBlueprint,
  type BlueprintVisual,
} from "./blueprintStore.ts";
