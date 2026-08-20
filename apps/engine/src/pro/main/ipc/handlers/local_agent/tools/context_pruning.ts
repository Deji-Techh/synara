import { z } from "zod";
import { AgentContext, ToolDefinition } from "./types";
import { generateText } from "ai";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { readSettings } from "@/main/settings";

const summarizeContextSchema = z.object({
  current_goal: z.string().describe("A brief description of the current overarching goal."),
  active_files: z.array(z.string()).describe("The list of files currently relevant to the goal."),
  context_to_compress: z
    .string()
    .describe(
      "The raw text of recent reasoning, findings, or completed steps that you want to compress.",
    ),
});

export const summarizeContextTool: ToolDefinition<z.infer<typeof summarizeContextSchema>> = {
  name: "summarize_context",
  description: `Use this tool when your context window is getting too large or filled with completed/irrelevant tasks.
It invokes a fast, inexpensive model to compress your provided context into a dense, token-efficient summary.
You can then rely on this summary and safely 'forget' the verbose history, preventing context overflow.`,
  inputSchema: summarizeContextSchema,
  defaultConsent: "always",
  isReadOnly: true,

  getConsentPreview: () => `Compressing chat context...`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    return `<caide-summarize-context>Compressing...</caide-summarize-context>`;
  },

  execute: async (args, _ctx: AgentContext) => {
    const settings = readSettings();
    // Default to a fast model like Gemini Flash or Claude Haiku if configured, otherwise use the active model
    // In a real system, you'd map this to the cheapest available model. We'll use the configured one for safety.
    const { modelClient } = await getModelClient(settings.selectedModel, settings);
    const model = modelClient.model;

    const systemPrompt = `You are a Context Compression Agent. 
Your job is to take the verbose reasoning, findings, and completed steps of a senior developer and compress them into a dense, token-efficient summary.
Keep ALL technical facts, variable names, architecture decisions, and open bugs.
Discard filler words, polite conversation, and step-by-step logs of things that are already successfully completed.

Current Goal: ${args.current_goal}
Active Files: ${args.active_files.join(", ")}
`;

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Compress the following context into a dense summary:\n\n${args.context_to_compress}`,
      });

      return `[COMPRESSED CONTEXT]\n${result.text}\n\n(You may now rely on this summary and stop referencing the older verbose history.)`;
    } catch (err) {
      return `Failed to compress context: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
