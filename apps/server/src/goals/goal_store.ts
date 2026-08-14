import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  PersistedGoalStateSchema,
  type PersistedGoalState,
} from "../shared/goal_state";
import type {
  Goal,
  GoalEvidence,
  GoalRun,
  GoalRunKind,
  GoalStatus,
  GoalTask,
} from "./goal_types";

const LIVE_GOAL_STATUSES = [
  "draft",
  "active",
  "running",
  "pausing",
  "paused",
  "verifying",
  "repairing",
  "blocked",
  "awaiting-user",
] as const;

export interface GoalRow {
  id: string;
  app_id: number;
  goal_chat_id: number | null;
  status: string;
}

export interface GoalActivityEvent {
  id: string;
  goalId: string;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export function ensureGoalTables(): void {}

export async function getGoalStatePath(goal: Pick<GoalRow, "id" | "app_id">) {
  return `/mock/goals/${goal.id}/state.json`;
}

export async function createGoal(input: any): Promise<Goal> {
  return {} as any;
}

export async function getGoal(goalId: string): Promise<Goal> {
  return {} as any;
}

export async function getActiveGoal(appId?: number | null): Promise<Goal | null> {
  return null;
}

export async function listGoals(input: any): Promise<Goal[]> {
  return [];
}

export async function updateGoalStatus(id: string, status: string, options?: any): Promise<Goal> {
  return {} as any;
}

export async function pauseGoal(id: string, options?: any): Promise<Goal> {
  return {} as any;
}

export async function finishPause(goalId: string): Promise<Goal> {
  return {} as any;
}

export async function resumeGoal(goalId: string): Promise<Goal> {
  return {} as any;
}

export async function cancelGoal(id: string, options?: any): Promise<Goal> {
  return {} as any;
}

export async function editGoal(id: string, options?: any): Promise<Goal> {
  return {} as any;
}

export async function steerGoal(id: string, options?: any): Promise<Goal> {
  return {} as any;
}

export function listActivity(goalId: string, limit = 200): GoalActivityEvent[] {
  return [];
}

export function createRun(goalId: string, kind: string, prompt: string): GoalRun {
  return {} as any;
}

export function cancelOpenRuns(goalId: string, reason: string): number {
  return 0;
}

export function recoverExpiredRuns(now = Date.now()): number {
  return 0;
}

export function hasOpenRun(goalId: string): boolean {
  return false;
}

export function hasActiveRunForChat(chatId: number): boolean {
  return false;
}

export function listRunnableRuns(limit = 10): GoalRun[] {
  return [];
}

export function claimRun(runId: string, runnerId: string): GoalRun | null {
  return null;
}

export function heartbeatRun(runId: string, runnerId: string): boolean {
  return false;
}

export async function setRunWaiting(input: any): Promise<Goal> {
  return {} as any;
}

export function finishRun(input: any): GoalRun {
  return {} as any;
}

export async function syncGoalFromState(goalId: string): Promise<{
  goal: Goal;
  state: PersistedGoalState | null;
  changed: boolean;
}> {
  return { goal: {} as any, state: null, changed: false };
}

export function recordVerificationApproval(goalId: string): void {}

export function hasCurrentVerificationApproval(goalId: string): boolean {
  return false;
}

export async function forceGoalStateActive(goalId: string): Promise<void> {}

export function hasContinuingGoals(): boolean {
  return false;
}

export function getGoalRowForScheduler(goalId: string): GoalRow {
  return {} as any;
}

export function listSchedulableGoalRows(now = Date.now()): GoalRow[] {
  return [];
}
