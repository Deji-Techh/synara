// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant goal system.

export {
  GoalStateSchema,
  GoalTaskStateSchema,
  GoalEvidenceSchema,
  GoalVerificationCriterionSchema,
  createGoalState,
  isGoalComplete,
  type GoalState,
  type GoalTaskState,
  type GoalEvidence,
} from "./goalState.ts";
export {
  ALL_GOAL_TOOLS,
  updateGoalStateTool,
  goalStatusTool,
  readGoalState,
  GoalValidationError,
} from "./goalTools.ts";
