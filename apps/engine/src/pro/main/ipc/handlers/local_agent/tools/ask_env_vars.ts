import { z } from "zod";
import crypto from "node:crypto";
import log from "electron-log";
import { ToolDefinition, AgentContext } from "./types";
import { safeSend } from "@/ipc/utils/safe_sender";
import { envVarResolver } from "../userInputResolvers";

const logger = log.scope("ask_env_vars");

const EnvVarRequestSchema = z.object({
  key: z
    .string()
    .describe("The name of the environment variable (e.g. OPENAI_API_KEY)"),
  description: z
    .string()
    .optional()
    .describe("A brief description of what this key is used for"),
  instructionsUrl: z
    .string()
    .optional()
    .describe("An optional URL where the user can get this key"),
});

const askEnvVarsSchema = z.object({
  vars: z
    .array(EnvVarRequestSchema)
    .min(1)
    .describe("A list of environment variables to prompt the user for"),
});

const DESCRIPTION = `Prompt the user to provide missing environment variables or API keys.
This tool displays a UI modal asking the user to securely input the keys. The agent execution will pause until the user provides the keys or dismisses the prompt.
The collected keys are NOT automatically saved; they are returned to you as the tool result, so you must then write them to a .env.local file or use them appropriately.

<when_to_use>
Use this tool when:
- You are implementing a feature that requires an API key (e.g. OpenAI, Firebase, Resend, Stripe)
- The required environment variables do not exist in the .env or .env.local file
- You need the user to get an API key from an external service before continuing
</when_to_use>

<input_schema>
The tool accepts a "vars" array.
Each object should have:
- "key" (string, REQUIRED): The name of the env var (e.g. STRIPE_SECRET_KEY)
- "description" (string, optional): A description explaining why this key is needed
- "instructionsUrl" (string, optional): A URL guiding the user to where they can generate this key
</input_schema>
`;

export const askEnvVarsTool: ToolDefinition<z.infer<typeof askEnvVarsSchema>> =
  {
    name: "ask_env_vars",
    description: DESCRIPTION,
    inputSchema: askEnvVarsSchema,
    defaultConsent: "always",
    isReadOnly: true,
    execute: async (args, ctx: AgentContext) => {
      const requestId = crypto.randomUUID();

      logger.info(
        `Agent requesting env vars: ${args.vars.map((v) => v.key).join(", ")}`,
      );

      // Send IPC event to frontend to display the modal
      safeSend(ctx.event.sender, "agent-tool:prompt-env-vars", {
        requestId,
        chatId: ctx.chatId,
        vars: args.vars,
      });

      // Wait for the user to respond via respondToEnvVarPrompt IPC
      const result = await envVarResolver.wait(
        requestId,
        ctx.chatId,
        ctx.abortSignal,
      );

      if (result === null) {
        return "User aborted or timed out without providing the environment variables. You must ask the user how they would like to proceed without these variables.";
      }

      // Format the result as text for the agent
      let textResult =
        "User provided the following environment variables:\\n\\n";
      for (const [key, value] of Object.entries(result)) {
        textResult += `${key}=${value}\\n`;
      }
      textResult +=
        "\\nYou must now save these variables to the appropriate environment file (e.g. .env.local) and continue with your task.";

      return textResult;
    },
  };
