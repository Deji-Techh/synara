import { z } from "zod";

export interface ToolContext {
  signal: AbortSignal;
  appPath: string;
  sessionId: string;
  toolId: string;
  stage?: string;
  role?: string;
}

export interface ToolDef<I = any, O = any> {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  readOnly: boolean;
  modifiesState: boolean;
  allowedStages?: readonly string[];
  allowedRoles?: readonly string[];
  timeoutMs?: number;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
  presentCall?: (input: I) => string;
  presentResult?: (output: O) => string;
}

export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}
