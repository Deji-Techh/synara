import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const ReferenceEntrySchema = z.object({
  originalPath: z.string(),
  referencePath: z.string(),
  name: z.string(),
});

export type ReferenceEntry = z.infer<typeof ReferenceEntrySchema>;

export const referenceContracts = {
  addReference: defineContract({
    channel: "reference:add",
    input: z.object({
      appPath: z.string(),
      chatId: z.number(),
    }),
    output: z.array(ReferenceEntrySchema),
  }),
  listReferences: defineContract({
    channel: "reference:list",
    input: z.object({
      appPath: z.string(),
      chatId: z.number(),
    }),
    output: z.array(ReferenceEntrySchema),
  }),
  removeReference: defineContract({
    channel: "reference:remove",
    input: z.object({
      appPath: z.string(),
      chatId: z.number(),
      referencePath: z.string(),
    }),
    output: z.void(),
  }),
} as const;

export const referenceClient = createClient(referenceContracts);
