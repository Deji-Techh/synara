import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const ActiveSubagentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  startedAt: z.number(),
  status: z.enum(["running", "completed", "failed"]).optional(),
  /** App/chat scoping when known (spawn_subagent tasks); explore-style
   * subagents omit these and are treated as engine-wide. */
  appId: z.number().optional(),
  chatId: z.number().optional(),
});
export type ActiveSubagent = z.infer<typeof ActiveSubagentSchema>;

export const ProjectArtifactSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
  createdAt: z.number(),
});
export type ProjectArtifact = z.infer<typeof ProjectArtifactSchema>;

export const BackgroundTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "idle", "error", "completed", "failed"]),
});
export type BackgroundTask = z.infer<typeof BackgroundTaskSchema>;

export const sidebarContracts = {
  getActiveSubagents: defineContract({
    channel: "sidebar:getActiveSubagents",
    input: z.object({ appId: z.number() }),
    output: z.array(ActiveSubagentSchema),
  }),
  getArtifacts: defineContract({
    channel: "sidebar:getArtifacts",
    input: z.object({ appId: z.number() }),
    output: z.array(ProjectArtifactSchema),
  }),
  getBackgroundTasks: defineContract({
    channel: "sidebar:getBackgroundTasks",
    input: z.object({ appId: z.number() }),
    output: z.array(BackgroundTaskSchema),
  }),
} as const;

export const sidebarClient = createClient(sidebarContracts);
