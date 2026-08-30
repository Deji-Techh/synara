import type { ToolDef, ToolContext } from "./defineTool.ts";

export interface ScheduledToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolSchedulerOptions {
  siblingAbortOnFailure?: boolean;
}

export class ToolScheduler {
  private siblingAbortOnFailure: boolean;

  constructor(options: ToolSchedulerOptions = {}) {
    this.siblingAbortOnFailure = options.siblingAbortOnFailure ?? true;
  }

  isConcurrencySafe(toolA: ToolDef, toolB?: ToolDef): boolean {
    if (!toolB) {
      return toolA.readOnly;
    }
    return toolA.readOnly && toolB.readOnly;
  }

  /**
   * Partitions a list of tool calls into execution batches:
   * Consecutive readOnly tools are batched together for parallel execution,
   * while modifying tools are isolated in sequential single-item batches.
   */
  partitionBatches(
    calls: ScheduledToolCall[],
    registry: Map<string, ToolDef>,
  ): ScheduledToolCall[][] {
    const batches: ScheduledToolCall[][] = [];
    let currentReadOnlyBatch: ScheduledToolCall[] = [];

    for (const call of calls) {
      const toolDef = registry.get(call.name);
      const isReadOnly = toolDef ? toolDef.readOnly : false;

      if (isReadOnly) {
        currentReadOnlyBatch.push(call);
      } else {
        if (currentReadOnlyBatch.length > 0) {
          batches.push(currentReadOnlyBatch);
          currentReadOnlyBatch = [];
        }
        batches.push([call]);
      }
    }

    if (currentReadOnlyBatch.length > 0) {
      batches.push(currentReadOnlyBatch);
    }

    return batches;
  }

  /**
   * Executes a batch of tool calls with concurrency safety and sibling abort support.
   */
  async runCalls(
    calls: ScheduledToolCall[],
    registry: Map<string, ToolDef>,
    baseCtx: Omit<ToolContext, "toolId">,
    executor: (toolDef: ToolDef, call: ScheduledToolCall, ctx: ToolContext) => Promise<unknown>,
  ): Promise<Map<string, { status: "completed" | "failed"; result?: unknown; error?: unknown }>> {
    const results = new Map<
      string,
      { status: "completed" | "failed"; result?: unknown; error?: unknown }
    >();

    const batches = this.partitionBatches(calls, registry);

    for (const batch of batches) {
      if (baseCtx.signal.aborted) break;

      if (batch.length === 1) {
        const call = batch[0];
        const def = registry.get(call.name);
        if (!def) {
          results.set(call.id, {
            status: "failed",
            error: new Error(`Unknown tool '${call.name}'`),
          });
          continue;
        }

        const toolCtx: ToolContext = {
          ...baseCtx,
          toolId: call.id,
        };

        try {
          const out = await executor(def, call, toolCtx);
          results.set(call.id, { status: "completed", result: out });
        } catch (err) {
          results.set(call.id, { status: "failed", error: err });
        }
      } else {
        // Parallel execution for concurrency-safe readOnly batch
        const siblingController = new AbortController();
        const onParentAbort = () => siblingController.abort("Parent signal aborted");
        baseCtx.signal.addEventListener("abort", onParentAbort, { once: true });

        const batchPromises = batch.map(async (call) => {
          const def = registry.get(call.name);
          if (!def) {
            results.set(call.id, {
              status: "failed",
              error: new Error(`Unknown tool '${call.name}'`),
            });
            return;
          }

          const toolCtx: ToolContext = {
            ...baseCtx,
            signal: siblingController.signal,
            toolId: call.id,
          };

          try {
            const out = await executor(def, call, toolCtx);
            results.set(call.id, { status: "completed", result: out });
          } catch (err) {
            results.set(call.id, { status: "failed", error: err });
            if (this.siblingAbortOnFailure) {
              siblingController.abort(`Sibling tool '${call.name}' failed`);
            }
          }
        });

        await Promise.allSettled(batchPromises);
        baseCtx.signal.removeEventListener("abort", onParentAbort);
      }
    }

    return results;
  }
}
