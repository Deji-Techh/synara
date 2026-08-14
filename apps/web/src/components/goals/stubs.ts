export type GoalCenterTab = "overview" | "tasks" | "activity" | "evidence" | "blockers" | "history" | "edit" | "commands";
export const goalCenterAtom = {} as any;
export const selectedAppIdAtom = {} as any;

export const BUILTIN_SLASH_COMMANDS = [] as any[];

export function showError(e: any) {}
export function showInfo(e: any) {}

export const ipc = {
  goal: {
    getActiveGoal: async (a: any) => null as any,
    createGoal: async (a: any) => null as any,
    editGoal: async (a: any) => null as any,
    listGoals: async (a: any) => [] as any[],
    listActivity: async (a: any) => [] as any[],
    pauseGoal: async (a: any) => null as any,
    resumeGoal: async (a: any) => null as any,
    retryGoal: async (a: any) => null as any,
    verifyGoal: async (a: any) => null as any,
    cancelGoal: async (a: any) => null as any,
  },
  events: {
    goal: {
      onUpdated: (cb: any) => () => {},
    }
  }
};
import { useState } from "react";
export function useAtom(atom: any) { return useState(atom || { open: false, appId: null, goalId: null, tab: "overview", createObjective: null }); }
export function useSetAtom(atom: any) { return useState(atom)[1]; }
export function useAtomValue(atom: any) { return []; }
export const pendingToolConsentsAtom = {};
export function useStreamChat(opts: any) { return { streamMessage: () => {} }; }
export function useLoadApps() { return { apps: [], loading: false }; }
