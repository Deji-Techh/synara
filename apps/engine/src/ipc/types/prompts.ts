import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Prompt Schemas
// =============================================================================

const slugSchema = z
  .string()
  .optional()
  .nullable()
  .refine(
    (s) => s === undefined || s === null || s === "" || /^[a-zA-Z0-9-]+$/.test(s),
    "Slug must be letters, numbers, and hyphens only",
  )
  .transform((s) => (s === "" ? undefined : s));

export const PromptDtoSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  slug: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PromptDto = z.infer<typeof PromptDtoSchema>;

export const CreatePromptParamsDtoSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  content: z.string(),
  slug: slugSchema,
});

export type CreatePromptParamsDto = z.infer<typeof CreatePromptParamsDtoSchema>;

export const UpdatePromptParamsDtoSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  slug: slugSchema,
});

export type UpdatePromptParamsDto = z.infer<typeof UpdatePromptParamsDtoSchema>;

export const SetAppPromptsParamsDtoSchema = z.object({
  appId: z.number(),
  promptIds: z.array(z.number()),
});

export type SetAppPromptsParamsDto = z.infer<typeof SetAppPromptsParamsDtoSchema>;

export const SetPromptAppsParamsDtoSchema = z.object({
  promptId: z.number(),
  appIds: z.array(z.number()),
});

export type SetPromptAppsParamsDto = z.infer<typeof SetPromptAppsParamsDtoSchema>;

// =============================================================================
// Prompt Contracts
// =============================================================================

export const promptContracts = {
  list: defineContract({
    channel: "prompts:list",
    input: z.void(),
    output: z.array(PromptDtoSchema),
  }),

  listForApp: defineContract({
    channel: "prompts:listForApp",
    input: z.number(), // appId
    output: z.array(PromptDtoSchema),
  }),

  setForApp: defineContract({
    channel: "prompts:setForApp",
    input: SetAppPromptsParamsDtoSchema,
    output: z.void(),
  }),

  appIdsForPrompt: defineContract({
    channel: "prompts:appIdsForPrompt",
    input: z.number(), // promptId
    output: z.array(z.number()),
  }),

  setPromptApps: defineContract({
    channel: "prompts:setPromptApps",
    input: SetPromptAppsParamsDtoSchema,
    output: z.void(),
  }),

  create: defineContract({
    channel: "prompts:create",
    input: CreatePromptParamsDtoSchema,
    output: PromptDtoSchema,
  }),

  update: defineContract({
    channel: "prompts:update",
    input: UpdatePromptParamsDtoSchema,
    output: z.void(),
  }),

  delete: defineContract({
    channel: "prompts:delete",
    input: z.number(), // id
    output: z.void(),
  }),
} as const;

// =============================================================================
// Prompt Client
// =============================================================================

export const promptClient = createClient(promptContracts);
