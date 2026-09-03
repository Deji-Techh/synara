// FILE: blueprintTools.ts
// Purpose: write_app_blueprint agent tool on the Caide DSL + Caide-shaped
// schema (frameworks are blank/react-native/flutter/website, not Dyad
// templates; no theme system — design tokens cover it).
// Donor: dyad x caide tools/write_app_blueprint.ts — flow kept (questionnaire
// first, lightweight card, turn pauses for approval); template/theme catalogs
// replaced by Caide framework resolution (provided → detected → project).

import * as fs from "node:fs";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { CAIDE_FRAMEWORKS } from "../prompts/framework.ts";
import { detectFrameworkFromDisk } from "../prompts/frameworkDetect.ts";
import { getBlueprint, presentBlueprint, type AppBlueprint } from "./blueprintStore.ts";

export class BlueprintValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintValidationError";
  }
}

const VisualEntrySchema = z.object({
  type: z.enum(["logo", "photo", "illustration", "icon", "background", "other"]).describe("The type of visual asset needed"),
  description: z.string().describe("What this visual is for and where it will be used in the app"),
  prompt: z.string().describe("A detailed image generation prompt: subject, style, colors, composition, mood"),
});

const writeAppBlueprintSchema = z.object({
  app_name: z.string().describe("A creative, memorable app name (1-3 words) based on the user's prompt"),
  user_prompt: z.string().describe("The original user prompt describing what to build"),
  framework: z
    .enum(CAIDE_FRAMEWORKS as unknown as [string, ...string[]])
    .optional()
    .describe("Project framework. Omit by default — the project's own framework is used. Only set when the user explicitly names a different stack."),
  design_direction: z.string().describe("Design direction in 1-2 sentences: industry, audience, mood"),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color must be a 6-digit hex code like '#3B82F6'")
    .describe("Primary/accent color as 6-digit hex"),
  visuals: z
    .array(VisualEntrySchema)
    .min(1, "At least one visual must be planned")
    .max(10, "Maximum 10 visuals per blueprint")
    .describe("Visual assets the app needs (logo, photos, illustrations, icons, backgrounds)"),
});

export interface BlueprintTransport {
  sendBlueprintUpdate(sessionId: string, blueprint: AppBlueprint): void;
}

let transport: BlueprintTransport | null = null;
export function setBlueprintTransport(t: BlueprintTransport | null): void {
  transport = t;
}
export function getBlueprintTransport(): BlueprintTransport | null {
  return transport;
}

export const writeAppBlueprintTool = defineTool({
  name: "write_app_blueprint",
  description: `Create the app blueprint for the user to review before building begins.

The app blueprint is a lightweight configuration step — it captures the app name, framework, design direction, color, and the visual assets the app needs (with detailed image generation prompts). The user reviews the blueprint card and approves it (or requests changes) before implementation starts.

<when_to_use>
Use this tool AFTER gathering preferences (via planning_questionnaire or from the prompt) when the user asks for a NEW app. Call it once with all fields populated, including visuals.
</when_to_use>

<guidelines>
- app_name: creative, memorable, 1-3 words.
- framework: omit by default — the project's framework applies. Only set when the user explicitly names a different stack.
- design_direction: specific but concise (1-2 sentences).
- primary_color: 6-digit hex fitting the industry.
- visuals: 3-6 typical (logo, photo, illustration, icon, background). Detailed prompts: subject, style, colors, composition, mood.
</guidelines>`,
  schema: writeAppBlueprintSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeWriteAppBlueprint(writeAppBlueprintSchema.parse(args), ctx.sessionId, ctx.appPath),
  presentCall: (args: any) => `App Blueprint: ${args.app_name}`,
});

export async function executeWriteAppBlueprint(
  input: z.infer<typeof writeAppBlueprintSchema>,
  sessionId: string,
  appPath: string,
): Promise<string> {
  const parsed = writeAppBlueprintSchema.parse(input);
  let framework = parsed.framework;
  if (!framework) {
    try {
      framework =
        (await detectFrameworkFromDisk(appPath)) ??
        (fs.existsSync(appPath) ? "website" : undefined);
    } catch {
      framework = undefined;
    }
  }
  const blueprint: AppBlueprint = {
    appName: parsed.app_name,
    userPrompt: parsed.user_prompt,
    framework,
    designDirection: parsed.design_direction,
    primaryColor: parsed.primary_color,
    visuals: parsed.visuals.map((v) => ({ type: v.type, description: v.description, prompt: v.prompt })),
  };
  presentBlueprint(sessionId, blueprint);
  const stored = getBlueprint(sessionId);
  if (stored) transport?.sendBlueprintUpdate(sessionId, stored);
  return "App blueprint written. Waiting for the user to review and approve it via the blueprint card.";
}

export const ALL_BLUEPRINT_TOOLS: ToolDef[] = [writeAppBlueprintTool];
