/**
 * Tool DSL — steal claude-code buildTool + deepseek defineTool.
 * Single schema, isConcurrencySafe per-input, presentCall/presentResult.
 */
import { z } from "zod";

export type ToolDefinition<Input extends Record<string, unknown> = Record<string, unknown>, Output = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  isReadOnly: boolean;
  isConcurrencySafe: (input: Input) => boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  execute: (input: Input, ctx: { signal: AbortSignal; appPath: string }) => Promise<Output>;
  presentCall?: (input: Input) => { card: string; title: string };
  presentResult?: (input: Input, output: Output) => { card: string; title: string };
};

export function defineTool<Input extends Record<string, unknown>, Output>(
  def: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  return def;
}

// Example pure tools — no harness coupling
export const readFileTool = defineTool({
  name: "read_file",
  description: "Read file inside project root. Returns error if path is outside project root. isReadOnly true, concurrencySafe true.",
  inputSchema: z.object({ path: z.string(), appPath: z.string() }),
  isReadOnly: true,
  isConcurrencySafe: () => true,
  timeoutMs: 10_000,
  execute: async ({ path }) => `content of ${path}`,
});

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Write file inside project root. Returns error if path is outside. isReadOnly false, concurrencySafe false. SIGTERM killable.",
  inputSchema: z.object({ path: z.string(), content: z.string(), appPath: z.string() }),
  isReadOnly: false,
  isConcurrencySafe: () => false,
  timeoutMs: 30_000,
  execute: async ({ path }) => `wrote ${path}`,
});
