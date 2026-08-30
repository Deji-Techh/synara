import { z } from "zod";
import type { ToolDef, ToolContext } from "./defineTool.ts";

export interface ToolExecutionSuccess<O = unknown> {
  success: true;
  output: O;
  durationMs: number;
}

export interface ToolExecutionFailure {
  success: false;
  error: {
    type: "ValidationError" | "PermissionError" | "ExecutionError" | "TimeoutError";
    tool: string;
    message: string;
    likelyCause: string;
    suggestedFix: string;
  };
  durationMs: number;
}

export type ToolExecutionResult<O = unknown> = ToolExecutionSuccess<O> | ToolExecutionFailure;

export async function executeTool<I, O>(
  toolDef: ToolDef<I, O>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolExecutionResult<O>> {
  const startTime = Date.now();

  // 1. Stage permission check
  if (toolDef.allowedStages && toolDef.allowedStages.length > 0 && ctx.stage) {
    if (!toolDef.allowedStages.includes(ctx.stage)) {
      return {
        success: false,
        error: {
          type: "PermissionError",
          tool: toolDef.name,
          message: `Tool '${toolDef.name}' is not permitted during stage '${ctx.stage}'.`,
          likelyCause: `The current execution stage '${ctx.stage}' only allows: ${toolDef.allowedStages.join(", ")}.`,
          suggestedFix: `Wait for the appropriate stage transition before calling this tool.`,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 2. Role permission check
  if (toolDef.allowedRoles && toolDef.allowedRoles.length > 0 && ctx.role) {
    if (!toolDef.allowedRoles.includes(ctx.role)) {
      return {
        success: false,
        error: {
          type: "PermissionError",
          tool: toolDef.name,
          message: `Role '${ctx.role}' is not allowed to invoke tool '${toolDef.name}'.`,
          likelyCause: `Tool is restricted to roles: ${toolDef.allowedRoles.join(", ")}.`,
          suggestedFix: `Delegate this action to the appropriate sub-agent role.`,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 3. Schema validation
  const parsed = toolDef.schema.safeParse(rawInput);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");

    return {
      success: false,
      error: {
        type: "ValidationError",
        tool: toolDef.name,
        message: `Schema validation failed for tool '${toolDef.name}': ${errorDetails}`,
        likelyCause: "Arguments provided do not match the expected tool schema.",
        suggestedFix: "Check required parameters and types in the tool definition and resubmit.",
      },
      durationMs: Date.now() - startTime,
    };
  }

  const timeoutMs = toolDef.timeoutMs ?? 30_000;

  // 4. Execution with timeout and abort signal support
  try {
    const executionPromise = toolDef.execute(parsed.data, ctx);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (ctx.signal) {
        ctx.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Tool execution aborted by signal"));
          },
          { once: true },
        );
      }
    });

    const output = await Promise.race([executionPromise, timeoutPromise]);

    return {
      success: true,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);

    const isTimeout = message.includes("timed out");

    return {
      success: false,
      error: {
        type: isTimeout ? "TimeoutError" : "ExecutionError",
        tool: toolDef.name,
        message,
        likelyCause: isTimeout
          ? `The tool execution took longer than the allocated timeout of ${timeoutMs}ms.`
          : "An error occurred during tool execution in the target environment.",
        suggestedFix: isTimeout
          ? "Consider breaking down the operation into smaller chunks or optimizing the query."
          : "Review the error message, verify state, and retry.",
      },
      durationMs: Date.now() - startTime,
    };
  }
}
