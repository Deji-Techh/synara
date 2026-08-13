// FILE: src/agent/agentLoop.ts
// Purpose: The engine's agent loop (M3: tools). Rebuilt from dyad x caide's
// local_agent_handler pattern but on the AI SDK's streamText with an
// OpenAI-compatible provider (decision F: user API keys + arbitrary base URL).
// Tools are plain ToolDefinition objects; the loop converts them to AI SDK
// tool() objects (v7 inputSchema/execute shape) and runs multi-step via
// stopWhen: isStepCount(maxSteps), so a tool-calling model can iterate:
// call tool -> execute locally -> feed result back -> final answer.
// Layer: Engine agent core

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, streamText, tool, type LanguageModel, type ToolSet } from "ai";

import type { ChatMode } from "@caide/contracts";

import type { ToolCallRecord, ToolContext, ToolDefinition } from "./tool.ts";

export interface EngineModelConfig {
  /** Base URL of the OpenAI-compatible endpoint, e.g. http://127.0.0.1:PORT/v1 */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
}

export interface AgentMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface RunTurnOptions {
  readonly abortSignal?: AbortSignal;
  /** Called for each text delta as it streams (for transcript piping later). */
  readonly onTextDelta?: (delta: string) => void;
  /** Called for each executed tool call (name + parsed args), in order. */
  readonly onToolCall?: (call: ToolCallRecord) => void;
}

export interface TurnResult {
  readonly text: string;
  readonly usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Full conversation after this turn (user + assistant appended). */
  readonly history: readonly AgentMessage[];
  /** Tool calls executed during this turn, in order. */
  readonly toolCalls: readonly ToolCallRecord[];
}

export interface AgentOptions {
  readonly model: EngineModelConfig;
  readonly systemPrompt?: string;
  readonly initialHistory?: readonly AgentMessage[];
  /** Tools exposed to the model. Empty = plain chat turns (M2 behavior). */
  readonly tools?: readonly ToolDefinition[];
  /** Execution context bound into tool calls (workspace/app dirs, etc.). */
  readonly toolContext?: ToolContext;
  /**
   * Max model-call steps per runTurn. Multi-step lets the model call tools and
   * iterate on their results; 1 = single-shot chat (default when no tools).
   */
  readonly maxSteps?: number;
  /**
   * Chat mode. `ask` strips tools for a plain Q&A answer; `plan` adds a
   * plan-only instruction and caps the loop to a single step so the model
   * produces a plan artifact without editing files.
   */
  readonly mode?: ChatMode;
}

const PLAN_MODE_SYSTEM_PROMPT =
  "You are in plan mode. Produce a concise implementation plan for the user's request " +
  "as structured markdown (steps, files touched, commands). Do not modify any files.";

export function resolveModeSystemPrompt(
  systemPrompt: string | undefined,
  mode: ChatMode | undefined,
): string {
  if (mode !== "plan") return systemPrompt ?? "";
  const base = systemPrompt ?? "";
  return base ? `${base}\n\n${PLAN_MODE_SYSTEM_PROMPT}` : PLAN_MODE_SYSTEM_PROMPT;
}

function shouldExposeTools(
  mode: ChatMode | undefined,
  tools: readonly ToolDefinition[] | undefined,
): boolean {
  if (mode === "ask") return false;
  if (mode === "plan") return false;
  return (tools?.length ?? 0) > 0;
}

export function resolveMaxSteps(
  mode: ChatMode | undefined,
  toolCount: number,
  explicitMaxSteps?: number,
): number {
  if (explicitMaxSteps !== undefined) return explicitMaxSteps;
  if (mode === "plan" || mode === "ask") return 1;
  return toolCount > 0 ? 20 : 1;
}

function toAISdkTools(
  definitions: readonly ToolDefinition[],
  context: ToolContext | undefined,
): ToolSet {
  const toolSet: ToolSet = {};
  for (const definition of definitions) {
    toolSet[definition.name] = tool({
      description: definition.description,
      inputSchema: definition.parameters,
      execute: async (args) => definition.execute(args, context ?? EMPTY_TOOL_CONTEXT),
    });
  }
  return toolSet;
}

const EMPTY_TOOL_CONTEXT: ToolContext = {
  workspaceDir: ".",
  appDir: ".",
};

export class Agent {
  private readonly model: LanguageModel;
  private readonly history: AgentMessage[];
  private readonly tools: ToolSet;
  private readonly maxSteps: number;

  constructor(readonly options: AgentOptions) {
    const provider = createOpenAICompatible({
      name: "caide-engine",
      baseURL: options.model.baseUrl,
      apiKey: options.model.apiKey,
    });
    this.model = provider.chatModel(options.model.modelId);
    this.history = [...(options.initialHistory ?? [])];
    // ask/plan modes intentionally drop tools (see shouldExposeTools).
    this.tools = toAISdkTools(
      shouldExposeTools(options.mode, options.tools) ? (options.tools ?? []) : [],
      options.toolContext,
    );
    const toolCount = Object.keys(this.tools).length;
    this.maxSteps = resolveMaxSteps(options.mode, toolCount, options.maxSteps);
  }

  get conversation(): readonly AgentMessage[] {
    return this.history;
  }

  async runTurn(userMessage: string, opts: RunTurnOptions = {}): Promise<TurnResult> {
    const systemPrompt = resolveModeSystemPrompt(this.options.systemPrompt, this.options.mode);
    const result = streamText({
      model: this.model,
      ...(systemPrompt !== "" && { system: systemPrompt }),
      messages: [
        ...this.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user" as const, content: userMessage },
      ],
      ...(Object.keys(this.tools).length > 0 ? { tools: this.tools } : {}),
      stopWhen: isStepCount(this.maxSteps),
      ...(opts.abortSignal !== undefined && { abortSignal: opts.abortSignal }),
    });

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      opts.onTextDelta?.(delta);
    }

    const [usage, steps] = await Promise.all([result.usage, result.steps]);

    const toolCalls: ToolCallRecord[] = [];
    for (const step of steps) {
      for (const call of step.toolCalls) {
        toolCalls.push({ name: call.toolName, args: call.input });
      }
    }
    for (const call of toolCalls) {
      opts.onToolCall?.(call);
    }

    this.history.push({ role: "user", content: userMessage });
    this.history.push({ role: "assistant", content: text });

    return {
      text,
      usage: {
        promptTokens: Number(usage.inputTokens ?? 0),
        completionTokens: Number(usage.outputTokens ?? 0),
        totalTokens: Number(usage.totalTokens ?? 0),
      },
      history: this.history,
      toolCalls,
    };
  }
}
