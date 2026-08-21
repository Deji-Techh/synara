// FILE: goalStore.ts
// Purpose: External store for engine goal state (goals, selected goal, activity
//          timeline, subagent runs) fed by the `goals:subscribe` WS stream and
//          the goals:* RPC methods. Thread-scoped UI state that the goals panel
//          and the composer strip share lives here so both stay in sync without
//          prop drilling.
// Layer: Web UI state store (zustand v5, no persistence — goal rows are the
//        engine's source of truth and are always refetched on mount).

import type {
  Goal,
  GoalActivityEvent,
  GoalDomainEvent,
  GoalExecutionTarget,
  GoalId,
  GoalRun,
} from "@caide/contracts";
import { create } from "zustand";

import { goalClient, parseGoalDomainEvent } from "./lib/goalClient";
import { GOAL_LIVE_STATUSES } from "./components/goals/goalStatus";

const ACTIVITY_LIMIT = 300;

function upsertGoalInList(goals: Goal[], goal: Goal): Goal[] {
  const index = goals.findIndex((existing) => existing.id === goal.id);
  if (index === -1) {
    return [goal, ...goals];
  }
  const next = [...goals];
  next[index] = goal;
  return next;
}

function upsertRunInList(runs: GoalRun[], run: GoalRun): GoalRun[] {
  const index = runs.findIndex((existing) => existing.id === run.id);
  if (index === -1) {
    return [run, ...runs];
  }
  const next = [...runs];
  next[index] = run;
  return next;
}

interface GoalStoreState {
  /** All goals for the engine, newest first (drives the panel list). */
  goals: Goal[];
  /**
   * Engine-wide active goal (most recently updated live goal, or null). The
   * composer strip + overlay render this; the panel selects from `goals`.
   */
  activeGoal: Goal | null;
  selectedGoalId: GoalId | null;
  activityByGoalId: Record<string, GoalActivityEvent[]>;
  /**
   * Subagent/goal runs observed from `goal.run-requested` domain events. Runs
   * are not individually listable over the bridge, so they accumulate here
   * from the live stream and are shown next to the activity timeline.
   */
  runsByGoalId: Record<string, GoalRun[]>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectGoal: (goalId: GoalId | null) => void;
  clearError: () => void;
  handleDomainEvent: (event: GoalDomainEvent) => void;
  createGoal: (input: {
    appId?: number | null;
    title?: string;
    objective: string;
    definitionOfDone?: string[];
    constraints?: string[];
    executionTarget?: GoalExecutionTarget;
  }) => Promise<Goal | null>;
  editGoal: (input: {
    goalId: GoalId;
    title?: string;
    objective?: string;
    definitionOfDone?: string[];
    constraints?: string[];
    executionTarget?: GoalExecutionTarget;
  }) => Promise<Goal | null>;
  steerGoal: (goalId: GoalId, instruction: string) => Promise<Goal | null>;
  pauseGoal: (goalId: GoalId) => Promise<Goal | null>;
  resumeGoal: (goalId: GoalId) => Promise<Goal | null>;
  cancelGoal: (goalId: GoalId) => Promise<Goal | null>;
  retryGoal: (goalId: GoalId) => Promise<Goal | null>;
  verifyGoal: (goalId: GoalId) => Promise<Goal | null>;
}

let refreshInFlight: Promise<void> | null = null;

export const useGoalStore = create<GoalStoreState>()((set, get) => {
  const applyGoal = (goal: Goal) =>
    set((state) => ({
      goals: upsertGoalInList(state.goals, goal),
      activeGoal: state.activeGoal?.id === goal.id ? goal : state.activeGoal,
    }));

  const applyError = (error: unknown) =>
    set({ error: error instanceof Error ? error.message : String(error) });

  const loadActivity = async (goalId: GoalId) => {
    try {
      const activity = await goalClient.listActivity(goalId, ACTIVITY_LIMIT);
      set((state) => ({ activityByGoalId: { ...state.activityByGoalId, [goalId]: activity } }));
    } catch (error) {
      // Activity polling failure must not take down the panel; the live stream
      // still drives the overview. Only the top-level refresh surfaces errors.
      console.warn(`Goal activity load failed for ${goalId}`, error);
    }
  };

  /**
   * Pull fresh runs for the known goals so run rows progress past "pending"
   * even though claim/finish transitions emit no dedicated domain events.
   */
  const loadRuns = async (goalIds: readonly GoalId[]) => {
    if (goalIds.length === 0) return;
    const results = await Promise.allSettled(
      goalIds.map(async (goalId) => {
        const runs = await goalClient.listRuns(goalId, 50);
        return [goalId, runs] as const;
      }),
    );
    set((state) => {
      const next: Record<string, GoalRun[]> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [goalId, runs] = result.value;
          if (runs.length > 0) next[goalId] = runs;
        }
      }
      // Keep prior entries for goals whose fetch failed or returned empty so
      // a transient RPC error doesn't wipe visible history.
      for (const [goalId, runs] of Object.entries(state.runsByGoalId)) {
        if (!(goalId in next)) next[goalId] = runs;
      }
      return { runsByGoalId: next };
    });
  };

  const refresh = async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      // Full refresh: goal list + engine-wide active goal. Errors surface once
      // instead of thrashing a mostly-healthy stream with repeated failures.
      try {
        set({ loading: !get().loaded });
        const [goals, activeGoal] = await Promise.all([
          goalClient.listGoals({}),
          goalClient.getActiveGoal(null),
        ]);
        const { selectedGoalId } = get();
        const selectedStillExists = goals.some((goal) => goal.id === selectedGoalId);
        const nextSelectedGoalId =
          selectedGoalId !== null && selectedStillExists
            ? selectedGoalId
            : (goals.find((goal) => GOAL_LIVE_STATUSES.includes(goal.status))?.id ??
              goals[0]?.id ??
              null);
        set({
          goals,
          activeGoal,
          selectedGoalId: nextSelectedGoalId,
          loaded: true,
          loading: false,
          error: null,
        });
        if (nextSelectedGoalId !== null && nextSelectedGoalId !== selectedGoalId) {
          void loadActivity(nextSelectedGoalId);
        }
        // Refresh runs for live goals so statuses stay current between events.
        void loadRuns(
          goals.filter((goal) => GOAL_LIVE_STATUSES.includes(goal.status)).map((goal) => goal.id),
        );
      } catch (error) {
        set({ loading: false, loaded: get().loaded });
        applyError(error);
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  };

  const selectGoal = (goalId: GoalId | null) => {
    set({ selectedGoalId: goalId });
    if (goalId !== null) {
      void loadActivity(goalId);
      void loadRuns([goalId]);
    }
  };

  return {
    goals: [],
    activeGoal: null,
    selectedGoalId: null,
    activityByGoalId: {},
    runsByGoalId: {},
    loaded: false,
    loading: false,
    error: null,
    refresh,
    selectGoal,

    clearError: () => set({ error: null }),

    handleDomainEvent: (event: GoalDomainEvent) => {
      const parsed = parseGoalDomainEvent(event);
      if (!parsed) return;
      if (parsed.domainType === "goal.updated") {
        applyGoal(parsed.payload.goal);
      } else if (parsed.domainType === "goal.run-requested") {
        const { run } = parsed.payload;
        set((state) => ({
          runsByGoalId: {
            ...state.runsByGoalId,
            [run.goalId]: upsertRunInList(state.runsByGoalId[run.goalId] ?? [], run),
          },
        }));
      }
      // Every event signals engine state movement: re-pull the list + active
      // goal. `refresh` coalesces concurrent events into a single request.
      void refresh();
    },

    createGoal: async (input) => {
      try {
        const goal = await goalClient.createGoal(input);
        applyGoal(goal);
        selectGoal(goal.id);
        void refresh();
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    editGoal: async (input) => {
      try {
        const goal = await goalClient.editGoal(input);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    steerGoal: async (goalId, instruction) => {
      try {
        const goal = await goalClient.steerGoal(goalId, instruction);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    pauseGoal: async (goalId) => {
      try {
        const goal = await goalClient.pauseGoal(goalId);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    resumeGoal: async (goalId) => {
      try {
        const goal = await goalClient.resumeGoal(goalId);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    cancelGoal: async (goalId) => {
      try {
        const goal = await goalClient.cancelGoal(goalId);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    retryGoal: async (goalId) => {
      try {
        const goal = await goalClient.retryGoal(goalId);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },

    verifyGoal: async (goalId) => {
      try {
        const goal = await goalClient.verifyGoal(goalId);
        applyGoal(goal);
        return goal;
      } catch (error) {
        applyError(error);
        return null;
      }
    },
  };
});
