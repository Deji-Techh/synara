/**
 * ToolScheduler — conflict graph, steal kimi-code loop/tool-scheduler.ts + claude-code StreamingToolExecutor.
 * Parallelize read-only non-conflicting, serialize writes.
 */
import type { ToolDefinition } from "./defineTool.ts";

export type ToolCall = { id: string; tool: string; input: Record<string, unknown> };

export class ToolScheduler {
  private running = new Set<string>();

  isConcurrencySafe(def: ToolDefinition, input: Record<string, unknown>): boolean {
    try {
      return def.isConcurrencySafe(input);
    } catch {
      return false;
    }
  }

  canRun(def: ToolDefinition, input: Record<string, unknown>): boolean {
    if (this.running.size === 0) return true;
    if (!this.isConcurrencySafe(def, input)) return false;
    // if all running are concurrency-safe, allow parallel
    return true;
  }

  async runBatch(
    calls: ToolCall[],
    registry: Map<string, ToolDefinition>,
    ctx: { signal: AbortSignal; appPath: string },
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();
    const batches: ToolCall[][] = [];
    let current: ToolCall[] = [];
    let hasWrite = false;

    for (const call of calls) {
      const def = registry.get(call.tool);
      if (!def) {
        results.set(call.id, { error: `unknown tool ${call.tool}` });
        continue;
      }
      const safe = this.isConcurrencySafe(def, call.input);
      if (!safe) {
        if (current.length) batches.push(current);
        batches.push([call]);
        current = [];
        hasWrite = false;
      } else {
        if (hasWrite) {
          batches.push(current);
          current = [call];
          hasWrite = false;
        } else {
          current.push(call);
        }
      }
    }
    if (current.length) batches.push(current);

    void hasWrite;

    for (const batch of batches) {
      if (ctx.signal.aborted) break;
      if (batch.length === 1 && !this.isConcurrencySafe(registry.get(batch[0]!.tool)!, batch[0]!.input)) {
        const c = batch[0]!;
        const def = registry.get(c.tool)!;
        try {
          const out = await def.execute(c.input, ctx);
          results.set(c.id, out);
        } catch (e) {
          results.set(c.id, { error: String(e) });
        }
      } else {
        // parallel safe batch
        await Promise.all(
          batch.map(async (c) => {
            const def = registry.get(c.tool)!;
            try {
              const out = await def.execute(c.input, ctx);
              results.set(c.id, out);
            } catch (e) {
              results.set(c.id, { error: String(e) });
            }
          }),
        );
      }
    }
    return results;
  }
}
