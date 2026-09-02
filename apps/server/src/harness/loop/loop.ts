import type { HarnessEvent } from "@caide/contracts";
import type { ChatMessage, HarnessRole } from "../session/buildChain.ts";
import { Inbox } from "../inbox/index.ts";
import { safeEmitLive } from "./events.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  readOnly?: boolean;
  execute: (
    args: unknown,
    context: { signal?: AbortSignal; sessionId: string; toolId: string },
  ) => Promise<unknown>;
}

export interface LLMStreamChunk {
  type: "token" | "tool_call";
  content?: string;
  toolCall?: { id: string; name: string; args: unknown };
}

export interface LLMAdapter {
  stream: (
    messages: ChatMessage[],
    options?: { tools?: ToolDefinition[]; signal?: AbortSignal },
  ) => AsyncGenerator<LLMStreamChunk, void, unknown>;
}

export interface StructuredToolError {
  type: string;
  tool: string;
  message: string;
  likelyCause?: string;
  suggestedFix?: string;
}

export interface LoopOptions {
  sessionId: string;
  turnId?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  llm: LLMAdapter;
  buildMessages: () => Promise<ChatMessage[]> | ChatMessage[];
  tools?: ToolDefinition[] | Map<string, ToolDefinition>;
  onEvent?: (event: HarnessEvent) => void;
  role?: HarnessRole;
  inbox?: Inbox;
  onToolError?: (toolName: string, error: unknown) => StructuredToolError;
}

export function formatStructuredToolError(toolName: string, error: unknown): StructuredToolError {
  if (typeof error === "object" && error !== null && "type" in error && "message" in error) {
    return error as StructuredToolError;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  let likelyCause = "Unexpected error encountered during tool execution.";
  let suggestedFix = "Check input arguments and retry with valid parameters.";

  if (rawMessage.includes("ENOENT") || rawMessage.includes("not found")) {
    likelyCause = "Target file or resource path does not exist.";
    suggestedFix = "Verify the path using directory listing or search before operating on it.";
  } else if (rawMessage.includes("EACCES") || rawMessage.includes("permission denied")) {
    likelyCause = "Insufficient filesystem or process permissions.";
    suggestedFix = "Ensure target directory permissions allow read/write operations.";
  } else if (rawMessage.includes("SyntaxError") || rawMessage.includes("JSON.parse")) {
    likelyCause = "Malformed input JSON syntax.";
    suggestedFix = "Provide strictly valid JSON formatting.";
  }

  return {
    type: "ToolExecutionError",
    tool: toolName,
    message: rawMessage,
    likelyCause,
    suggestedFix,
  };
}

export async function* runLoop(options: LoopOptions): AsyncGenerator<HarnessEvent, void, unknown> {
  const sessionId = options.sessionId;
  const turnId = options.turnId ?? `turn-${Date.now()}`;
  const maxSteps = options.maxSteps ?? 25;
  const signal = options.signal;
  const inbox = options.inbox ?? new Inbox();
  const role = options.role ?? "builder";

  // Index tools by name
  const toolMap = new Map<string, ToolDefinition>();
  if (options.tools) {
    if (Array.isArray(options.tools)) {
      for (const t of options.tools) toolMap.set(t.name, t);
    } else {
      for (const [name, def] of options.tools.entries()) toolMap.set(name, def);
    }
  }

  const emit = (event: HarnessEvent) => {
    safeEmitLive(options.onEvent, event);
    return event;
  };

  inbox.markProcessing(true);

  let step = 0;

  try {
    while (step < maxSteps) {
      if (signal?.aborted) {
        break;
      }

      // Check pre-step waterfall hooks
      const preStepResult = await inbox.evaluatePreStep({ step, role });
      if (preStepResult.action === "reject") {
        yield emit({
          type: "error",
          sessionId,
          code: "PRE_STEP_REJECTED",
          message: preStepResult.reason ?? "Pre-step validation rejected step.",
          recoverable: false,
        });
        break;
      }

      // Check for steering messages in inbox
      const nextStepMessages = inbox.claimNextStep();
      const steerPrompts = nextStepMessages
        .filter((m): m is { type: "steer"; prompt: string; time: number } => m.type === "steer")
        .map((m) => m.prompt);

      // Build context messages for current step
      const baseMessages = await options.buildMessages();
      const messages = [...baseMessages];

      for (const steerPrompt of steerPrompts) {
        messages.push({
          role: "user",
          content: `[User Steering Instruction]: ${steerPrompt}`,
        });
      }

      yield emit({
        type: "stage",
        sessionId,
        from: step === 0 ? "idle" : `step-${step - 1}`,
        to: `step-${step}`,
        meta: { step, role, steerInjected: steerPrompts.length > 0 },
      });

      const toolList = Array.from(toolMap.values());
      const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = [];

      // Stream LLM response
      const streamOpts: { tools: ToolDefinition[]; signal?: AbortSignal } = { tools: toolList };
      if (signal) streamOpts.signal = signal;
      const stream = options.llm.stream(messages, streamOpts);

      for await (const chunk of stream) {
        if (signal?.aborted) break;

        if (chunk.type === "token" && chunk.content) {
          yield emit({
            type: "token",
            sessionId,
            content: chunk.content,
          });
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          pendingToolCalls.push(chunk.toolCall);
        }
      }

      if (signal?.aborted) {
        break;
      }

      // If no tool calls occurred, LLM completed its generation for the turn
      if (pendingToolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      for (const call of pendingToolCalls) {
        if (signal?.aborted) break;

        const startTime = Date.now();
        const toolDef = toolMap.get(call.name);

        yield emit({
          type: "tool_call",
          sessionId,
          id: call.id,
          name: call.name,
          args: call.args,
          status: "started",
        });

        if (!toolDef) {
          const formattedErr = formatStructuredToolError(
            call.name,
            `Unknown tool: '${call.name}'. Available tools: ${Array.from(toolMap.keys()).join(", ")}`,
          );
          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: call.name,
            args: call.args,
            status: "failed",
            result: formattedErr,
            durationMs: Date.now() - startTime,
          });
          continue;
        }

        try {
          // Bound tool execution so a hung tool (network, missing dir) can't
          // block the turn forever. 30s per tool is generous for file ops and
          // builds while still guaranteeing forward progress.
          const executeCtx: { signal?: AbortSignal; sessionId: string; toolId: string } = {
            sessionId,
            toolId: call.id,
          };
          if (signal) executeCtx.signal = signal;
          const result = await Promise.race([
            toolDef.execute(call.args, executeCtx),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Tool '${call.name}' timed out after 30000ms`)),
                30_000,
              ),
            ),
          ]);

          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: call.name,
            args: call.args,
            status: "completed",
            result,
            durationMs: Date.now() - startTime,
          });
        } catch (err) {
          const errorFormatter = options.onToolError ?? formatStructuredToolError;
          const formattedErr = errorFormatter(call.name, err);

          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: call.name,
            args: call.args,
            status: "failed",
            result: formattedErr,
            durationMs: Date.now() - startTime,
          });
        }
      }

      step += 1;
    }
  } finally {
    inbox.markProcessing(false);
  }
}
