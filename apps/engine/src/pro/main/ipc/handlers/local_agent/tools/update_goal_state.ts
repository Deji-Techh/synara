import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { type ToolDefinition, type AgentContext, escapeXmlAttr } from "./types";
import { getCaideAppPath } from "@/paths/paths";
import { PersistedGoalStateSchema } from "@/shared/goal_state";

const updateGoalStateSchema = z.object({
  goalId: z.string().describe("The ID of the active Goal"),
  state: PersistedGoalStateSchema.describe(
    "The fully updated goal state object",
  ),
});

export const updateGoalStateTool: ToolDefinition<
  z.infer<typeof updateGoalStateSchema>
> = {
  name: "update_goal_state",
  description:
    "Update the durable state for an active CAIDE Goal. Use this instead of modifying state.json directly to ensure the schema is strictly enforced. Pass the entire mutated state object.",
  inputSchema: updateGoalStateSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Update goal state for ${args.goalId}`,

  buildXml: (args) => {
    return `<update_goal_state goalId="${escapeXmlAttr(args.goalId)}">...</update_goal_state>`;
  },

  execute: async ({ goalId, state }, ctx: AgentContext) => {
    // Validate that the state strictly matches the schema
    const parsedState = PersistedGoalStateSchema.parse(state);

    const appPath = getCaideAppPath(ctx.appPath);
    const stateDir = path.join(appPath, ".caide", "goals", goalId);
    const stateFile = path.join(stateDir, "state.json");

    await fs.mkdir(stateDir, { recursive: true });

    // Write atomically
    const tempFile = `${stateFile}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(parsedState, null, 2), "utf8");
    await fs.rename(tempFile, stateFile);

    return `Goal state for ${goalId} successfully updated and validated.`;
  },
};
