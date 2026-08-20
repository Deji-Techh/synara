import { streamText } from "ai";

import { z } from "zod";
import { readSettings } from "@/main/settings";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { getAiHeaders, getProviderOptions } from "@/ipc/utils/provider_options";
import { withSystemCacheBreakpoint } from "@/ipc/utils/cache_breakpoints";
import { cancelOrphanedBaseStream, fastTextOutput } from "@/ipc/utils/stream_text_utils";
import { getMaxTokens, getTemperature } from "@/ipc/utils/token_utils";
import { buildTool, type AgentContext } from "./types";
import { COMPANION_SKILL_FRONTMATTERS } from "@/prompts/mobile_ui_skill_pack";
import { WEB3_SKILL_FRONTMATTERS } from "@/prompts/web3_skill_pack";

const FORK_SKILL_REGISTRY: Record<string, { description: string }> = {};
for (const [id, fm] of Object.entries(COMPANION_SKILL_FRONTMATTERS)) {
  FORK_SKILL_REGISTRY[id] = { description: fm.description ?? "" };
}
for (const [id, fm] of Object.entries(WEB3_SKILL_FRONTMATTERS)) {
  FORK_SKILL_REGISTRY[id] = { description: fm.description ?? "" };
}

const knownSkillIds = Object.keys(FORK_SKILL_REGISTRY).join(", ");

const executeForkSkillSchema = z.object({
  skill_id: z.string().describe(`The skill identifier. Known skills: ${knownSkillIds}`),
  task: z.string().describe("The specific task to delegate to this skill sub-agent"),
  context: z
    .string()
    .optional()
    .describe("Optional file paths or data for the sub-agent to work with"),
});

async function executeForkSkillFn(args: z.infer<typeof executeForkSkillSchema>, ctx: AgentContext) {
  const { skill_id, task, context } = args;

  const subSystemPrompt = [
    `You are a specialized sub-agent using the "${skill_id}" skill.`,
    FORK_SKILL_REGISTRY[skill_id]?.description
      ? `\n## Skill Description\n${FORK_SKILL_REGISTRY[skill_id].description}`
      : "",
    context ? `\n## Context\n${context}` : "",
    `\n## Task\n${task}`,
    "\n## Constraints\n- Provide your analysis or output directly.",
    "- Be thorough, specific, and actionable.",
    "- Do not ask clarifying questions — work with what you have.",
  ]
    .filter(Boolean)
    .join("\n");

  const settings = readSettings();
  const modelInfo = await getModelClient(settings.selectedModel, settings);
  const subagentModel = settings.selectedModel;
  const maxTokens = (await getMaxTokens(subagentModel)) ?? 4_000;

  const streamResult = streamText({
    output: fastTextOutput(),
    model: modelInfo.modelClient.model,
    headers: getAiHeaders({
      builtinProviderId: modelInfo.modelClient.builtinProviderId,
    }),
    providerOptions: getProviderOptions({
      caideAppId: ctx.appId,
      caideRequestId: ctx.caideRequestId,
      caideDisableFiles: true,
      files: [],
      mentionedAppsCodebases: [],
      builtinProviderId: modelInfo.modelClient.builtinProviderId,
      settings,
    }),
    maxOutputTokens: maxTokens,
    temperature: await getTemperature(subagentModel),
    maxRetries: 1,
    system: withSystemCacheBreakpoint(subSystemPrompt, modelInfo.modelClient.builtinProviderId),
    prompt: task,
    abortSignal: ctx.abortSignal,
  });
  cancelOrphanedBaseStream(streamResult);

  const collectedChunks: string[] = [];
  for await (const part of streamResult.fullStream) {
    if (part.type === "text-delta") {
      collectedChunks.push(part.text);
    }
  }

  const fullText = collectedChunks.join("");
  return [`<fork-skill-execution skill="${skill_id}">`, fullText, `</fork-skill-execution>`].join(
    "\n",
  );
}

export const executeForkSkillTool = buildTool({
  name: "execute_fork_skill",
  description: [
    "Delegate a self-contained analysis or review task to a specialized skill sub-agent.",
    "The sub-agent runs the skill's domain logic as a focused LLM call.",
    "Use this when a task requires deep, focused attention from a specific skill domain.",
    `Available skills: ${knownSkillIds}`,
  ].join(" "),
  inputSchema: executeForkSkillSchema,
  defaultConsent: "ask" as const,
  isReadOnly: true,
  shouldDefer: true,
  execute: executeForkSkillFn,
});
