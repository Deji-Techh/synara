// FILE: src/agent/tool.ts
// Purpose: Tool contract for the engine agent loop. A tool is a named,
// zod-parameterized function over a ToolContext. Mirrors the Caide tool
// definition shape (rebuild, not copy) so the loop can grow subagents,
// sandboxes, and approval hooks later without rework.
// Layer: Engine agent core

import type { z } from "zod";

export interface ToolContext {
  /** Engine-owned workspace root; every file tool resolves against it. */
  readonly workspaceDir: string;
  /** App directory of the active Flutter project (where flutter commands run). */
  readonly appDir: string;
  /** Optional override for the flutter binary (tests pass a shim here). */
  readonly flutterBinary?: string;
}

export interface ToolDefinition<PARAMS extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly parameters: PARAMS;
  readonly execute: (
    args: z.infer<PARAMS>,
    context: ToolContext,
  ) => Promise<string> | string;
}

/**
 * Creates a ToolDefinition with the parameter schema's inferred input type
 * bound to `execute` — so tool authors get typed args without extra generics.
 */
export function defineTool<PARAMS extends z.ZodType>(
  definition: ToolDefinition<PARAMS>,
): ToolDefinition<PARAMS> {
  return definition;
}

export type ToolSet = Readonly<Record<string, ToolDefinition>>;

export type ToolName<T extends ToolSet> = keyof T & string;

export interface ToolCallRecord {
  readonly name: string;
  readonly args: unknown;
}

export interface ToolResultRecord {
  readonly name: string;
  readonly output: string;
}