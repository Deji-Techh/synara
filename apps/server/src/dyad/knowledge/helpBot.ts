// FILE: helpBot.ts
// Purpose: Caide help bot over the user-keyed provider router (no
// hard-coded helpchat endpoint — 007 §1 DELETE list, re-pointed per 014).
// Donor: dyad x caide help_bot_handlers.ts (session history, abort, model
// alias) — Electron IPC replaced with a harness tool; the model resolves
// through the turn's provider connection (user keys only, everything free).

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import {
  resolveAutoProvider,
  resolveConnection,
  resolveProviderDefaultModel,
} from "../../dyad/providers/index.ts";
import { streamProvider } from "../../harness/provider/apiAdapter.ts";

const HELP_SYSTEM = `You are the Caide help bot. Answer questions about using Caide: projects, chats, preview, providers and models, database connections, publishing, settings, and troubleshooting. Be concise and concrete (click paths, command names). Never invent features. If a question is about the user's own app code rather than Caide itself, say so and suggest asking in the chat instead.`;

const helpAskSchema = z.object({
  question: z.string().min(1).describe("The Caide usage question to answer"),
});

export const helpAskTool = defineTool({
  name: "ask_help",
  description: `Answer a Caide usage question (projects, preview, providers, database, publishing, settings, troubleshooting) using the current turn's provider. Use when the user asks how to do something in Caide itself — not for their app code.`,
  schema: helpAskSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = helpAskSchema.parse(args);
    // User-keyed routing only: first provider with a key (keyless local
    // runtimes included, same as turns). No engine, no quota.
    const providerId = resolveAutoProvider({});
    const modelId = resolveProviderDefaultModel(providerId) ?? "auto";
    const connection = resolveConnection(providerId, modelId, {});
    if (
      !connection.apiKey &&
      connection.providerId !== "ollama" &&
      connection.providerId !== "lmstudio"
    ) {
      throw new Error("No provider key configured — add one in Agent providers settings first.");
    }
    let text = "";
    const stream = streamProvider({
      modelId,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey ?? "ollama",
      system: HELP_SYSTEM,
      messages: [{ role: "user", content: parsed.question }],
      signal: ctx.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === "token") text += chunk.content;
    }
    return text.trim() || "The help bot returned an empty answer — try rephrasing the question.";
  },
  presentCall: () => "Ask Caide help",
});

export const ALL_HELP_TOOLS: ToolDef[] = [helpAskTool];
