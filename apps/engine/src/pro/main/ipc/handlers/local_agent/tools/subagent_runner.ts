import crypto from "node:crypto";
import { streamText, stepCountIs, type ToolSet } from "ai";
import { readSettings } from "@/main/settings";
import { getModelClient } from "@/ipc/utils/get_model_client";
import { getAiHeaders, getProviderOptions } from "@/ipc/utils/provider_options";
import {
  withSystemCacheBreakpoint,
  withToolCacheBreakpoint,
} from "@/ipc/utils/cache_breakpoints";
import {
  cancelOrphanedBaseStream,
  fastTextOutput,
} from "@/ipc/utils/stream_text_utils";
import { getMaxTokens, getTemperature } from "@/ipc/utils/token_utils";
import type { AgentContext } from "./types";

export interface SubagentRunnerParams {
  ctx: AgentContext;
  system: string;
  prompt: string;
  tools: ToolSet;
  maxSteps: number;
  name?: string;
  description?: string;
  subagentId?: string;
  maxOutputTokens?: number;
  maxRetries?: number;
  stopWhen?: Parameters<typeof streamText>[0]["stopWhen"];
  prepareStep?: Parameters<typeof streamText>[0]["prepareStep"];
}

/**
 * Result returned by a completed subagent loop.
 */
export interface SubagentRunResult {
  /** The final accumulated text output from the last assistant turn. */
  finalText: string;
  /** Total number of steps (tool calls + text turns) executed. */
  stepCount: number;
  /** True if the run was aborted via the parent's AbortSignal. */
  aborted: boolean;
}

/**
 * A generic execution wrapper for running autonomous bounded subagents using the Vercel AI SDK.
 * Encapsulates the boilerplate for model initialization, header assignment, provider options,
 * and stream lifecycle management.
 *
 * Returns a SubagentRunResult containing the final text output and execution metadata.
 * Callers that do not need the return value can safely ignore it (backward-compatible).
 */
export async function runSubagentLoop(
  params: SubagentRunnerParams,
): Promise<SubagentRunResult> {
  const {
    ctx,
    system,
    prompt,
    tools,
    maxSteps,
    stopWhen = [],
    prepareStep,
  } = params;

  if (!(globalThis as any).__caideActiveSubagents) {
    (globalThis as any).__caideActiveSubagents = new Map();
  }
  const subagentId = params.subagentId ?? crypto.randomUUID();
  const subagentMap = (globalThis as any).__caideActiveSubagents;
  subagentMap.set(subagentId, {
    id: subagentId,
    name: params.name ?? "Subagent Task",
    description: params.description ?? prompt.slice(0, 100),
    startedAt: Date.now(),
  });

  const settings = readSettings();
  const subagentModel = settings.selectedModel;
  const modelInfo = await getModelClient(subagentModel, settings);

  const defaultMaxTokens = 16_000;
  const maxOutputTokens = Math.min(
    (await getMaxTokens(subagentModel)) ?? defaultMaxTokens,
    params.maxOutputTokens ?? defaultMaxTokens,
  );

  const temperature = await getTemperature(subagentModel);

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
    maxOutputTokens,
    temperature,
    maxRetries: params.maxRetries ?? 1,
    system: withSystemCacheBreakpoint(
      system,
      modelInfo.modelClient.builtinProviderId,
    ),
    prompt,
    tools: withToolCacheBreakpoint(
      tools,
      modelInfo.modelClient.builtinProviderId,
    ),
    prepareStep,
    stopWhen: [
      stepCountIs(maxSteps),
      ...(Array.isArray(stopWhen) ? stopWhen : stopWhen ? [stopWhen] : []),
    ] as any,
    abortSignal: ctx.abortSignal,
  });

  const fullStream = streamResult.fullStream;
  cancelOrphanedBaseStream(streamResult);

  let finalText = "";
  let stepCount = 0;
  let currentStepText = "";

  try {
    for await (const part of fullStream) {
      if (part.type === "text-delta") {
        currentStepText += part.text;
      } else if (part.type === "finish-step") {
        stepCount++;
        if (currentStepText) {
          // Keep the most recent non-empty text turn as the final output
          finalText = currentStepText;
        }
        currentStepText = "";
      }
    }
    // Capture any trailing text that didn't get a step-finish event
    if (currentStepText) {
      finalText = currentStepText;
    }
  } finally {
    subagentMap.delete(subagentId);
  }

  return {
    finalText,
    stepCount,
    aborted: !!ctx.abortSignal?.aborted,
  };
}
